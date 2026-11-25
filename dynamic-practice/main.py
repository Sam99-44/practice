import os
import re
import hmac
import time
from collections import OrderedDict
from threading import Lock
from random import choice
from typing import Literal
from uuid import uuid4

from fastapi import FastAPI, Response, HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from engines import mathjax
from engines import factorisation
from engines.grade_08.term_01 import questions as grade8_term1
from engines.marking import mark_answer

app = FastAPI(
    title="Practice Online - Dynamic Practice",
    description="Dynamic Mathematics Learning Engine",
    docs_url=None, redoc_url=None, openapi_url=None,
    version="2.1.0",
)


@app.middleware("http")
async def internal_only(request: Request, call_next):
    if request.url.path == "/health":
        return await call_next(request)
    secret = os.environ.get("DYNAMIC_API_SECRET", "")
    supplied = request.headers.get("x-dynamic-secret", "")
    owner = request.headers.get("x-learner-id", "")
    if len(secret) < 32 or not hmac.compare_digest(secret.encode(), supplied.encode()):
        return JSONResponse({"detail": "Unauthorized service request."}, status_code=401)
    if not re.fullmatch(r"[0-9a-fA-F]{24}", owner):
        return JSONResponse({"detail": "Invalid learner identity."}, status_code=401)
    request.state.owner = owner.lower()
    return await call_next(request)


@app.get("/")
def home():
    return {"platform": "Practice Online", "engine": "Dynamic Practice", "version": "2.1.0", "status": "Running"}


@app.get("/health")
def health():
    return {"status": "healthy"}


# Bounded in-memory storage. Restart or multi-worker deployments need shared persistence.
records = OrderedDict()
record_lock = Lock()
TTL = 1800
MAX_RECORDS = 5000
MAX_PER_LEARNER = 5
MAX_TRIES = 2


class Submission(BaseModel):
    question_id: str = Field(max_length=36)
    answer: str = Field(min_length=1, max_length=160)
    request_id: str = Field(min_length=1, max_length=80)


# Grade 8 Term 1 is controlled by the official ATP topic/subtopic list.
CATALOG = {8: list(grade8_term1.TOPICS), 10: ['Factorisation']}
SKILLS = {'Factorisation': ['Trinomials', 'Difference of Two Squares'], **grade8_term1.TOPICS}
ENGINES = {'Factorisation': factorisation, **{name: grade8_term1 for name in grade8_term1.TOPICS}}


@app.get('/api/mathematics/catalog')
def catalog():
    return CATALOG


@app.get('/api/mathematics/skills')
def skill_catalog():
    return SKILLS


@app.get('/api/mathematics/generate')
def generate_question(
    request: Request,
    response: Response,
    grade: int = 10,
    topic: str = 'Factorisation',
    level: Literal['foundation', 'advanced'] = 'foundation',
    skill: str = 'Mixed Practice',
    question_type: Literal['auto', 'mcq', 'text'] = 'auto',
):
    response.headers['Cache-Control'] = 'no-store'
    if topic not in CATALOG.get(grade, []):
        raise HTTPException(400, 'Choose a supported grade and topic.')
    if skill != 'Mixed Practice' and skill not in SKILLS[topic]:
        raise HTTPException(400, 'Choose a supported subtopic.')

    selected = choice(SKILLS[topic]) if skill == 'Mixed Practice' else skill
    # Grade 8 Term 1 uses its own grade/term package; Grade 10 remains in engines/factorisation.py.
    if topic in grade8_term1.TOPICS:
        requested_type = None if question_type == 'auto' else question_type
        q, instruction, kind, value, private, hint = grade8_term1.generate(
            level, selected, question_type=requested_type, topic=topic
        )
    elif topic == 'Factorisation':
        requested_type = None if question_type == 'auto' else question_type
        q, instruction, kind, value, private, hint = ENGINES[topic].generate(
            level, selected, question_type=requested_type
        )
    else:
        if question_type == 'mcq':
            raise HTTPException(400, 'Multiple-choice questions are not yet supported for this topic.')
        q, instruction, kind, value, private, hint = ENGINES[topic].generate(level, selected)

    # Only generators which actually supply fully valid MCQs can produce them.
    # Other topic engines remain typed-answer until updated; never invent choices.
    is_mcq = kind == 'mcq'
    options = None
    if is_mcq:
        options = private.get('mcq_options')
        correct_choice = private.get('correct_choice')
        if not isinstance(options, list) or len(options) != 6:
            raise HTTPException(500, 'MCQ generator did not supply six answer options.')
        letters = [item.get('value') for item in options if isinstance(item, dict)]
        if letters != list('ABCDEF') or correct_choice not in letters:
            raise HTTPException(500, 'MCQ generator returned invalid answer options.')
        if any(not isinstance(item.get('mathjax'), str) or not item['mathjax'] for item in options):
            raise HTTPException(500, 'MCQ generator returned an empty answer option.')
        # Public object contains only display information; correct_choice stays private.
        options = [{'value': item['value'], 'mathjax': item['mathjax']} for item in options]

    question_id = str(uuid4())
    now = time.monotonic()
    with record_lock:
        # Remove all expired records (not only the oldest).
        for key in list(records):
            if records[key]['expires'] <= now:
                del records[key]
        while len(records) >= MAX_RECORDS:
            records.popitem(last=False)
        owned = [key for key, item in records.items() if item['owner'] == request.state.owner]
        while len(owned) >= MAX_PER_LEARNER:
            records.pop(owned.pop(0), None)
        records[question_id] = {
            'owner': request.state.owner,
            'kind': kind,
            'value': value,
            'private': private,
            'hint': hint,
            'expires': now + TTL,
            'result': None,
            'tries': 0,
            'requests': {},
        }

    public_question = {
        'question_id': question_id,
        'grade': grade,
        'subject': 'Mathematics',
        'topic': topic,
        'subtopic': selected,
        'practice_category': 'dynamic',
        'practice_level': level,
        'difficulty': 'moderate' if level == 'advanced' else 'easy',
        'type': 'mcq' if is_mcq else 'text',
        'question_type': 'mcq' if is_mcq else 'text',
        'points': 2,
        'instruction': instruction,
        'question': q,
        'question_mathjax': mathjax(q),
        'answer_kind': kind,
    }
    if is_mcq:
        public_question['options'] = options
    return public_question


@app.post('/api/mathematics/submit')
def submit_answer(submission: Submission, response: Response, request: Request):
    response.headers['Cache-Control'] = 'no-store'
    with record_lock:
        record = records.get(submission.question_id)
        if record is None or record['owner'] != request.state.owner or record['expires'] <= time.monotonic():
            raise HTTPException(404, 'Question expired or server restarted. Generate a new question.')
        previous = record['requests'].get(submission.request_id)
        if previous is not None:
            if previous[0] != submission.answer:
                raise HTTPException(409, 'Request ID already used for another answer.')
            return previous[1]
        if record['result'] is not None:
            raise HTTPException(409, 'This question is complete. Generate a new question.')

        correct, message = mark_answer(submission.answer, record)
        if correct is None:
            return {
                'status': 'invalid', 'message': message, 'complete': False,
                'tries': record['tries'], 'remaining': MAX_TRIES - record['tries'],
            }

        record['tries'] += 1
        complete = correct or record['tries'] >= MAX_TRIES
        result = {
            'question_id': submission.question_id,
            'status': 'correct' if correct else 'incorrect',
            'correct': correct,
            'complete': complete,
            'tries': record['tries'],
            'remaining': MAX_TRIES - record['tries'],
            'first_try_correct': bool(correct and record['tries'] == 1),
            'message': (message if correct else
                        'Not quite. Check your calculations, then try again.' if not complete else
                        'Review the worked solution before continuing.'),
        }
        if complete:
            # Return teaching material, not the private question-generator metadata.
            # Correct choices and worked solutions are disclosed only after completion.
            private = record['private']
            for name in ('answer', 'answer_mathjax', 'solution'):
                if name in private:
                    result[name] = private[name]
            if record['kind'] == 'mcq':
                result['correct_choice'] = private['correct_choice']
            record['result'] = result
        record['requests'][submission.request_id] = (submission.answer, result)
        return result


@app.get('/api/mathematics/hint/{question_id}')
def get_hint(question_id: str, response: Response, request: Request):
    response.headers['Cache-Control'] = 'no-store'
    with record_lock:
        record = records.get(question_id)
        if record is None or record['owner'] != request.state.owner or record['expires'] <= time.monotonic():
            raise HTTPException(404, 'Question expired. Generate a new question.')
        return {'hint': record['hint']}
