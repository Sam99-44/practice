



from fastapi import FastAPI, Response, HTTPException, Request
from fastapi.responses import JSONResponse
import os, hmac
from pydantic import BaseModel, Field
from collections import OrderedDict
from threading import Lock
import re
import time
from fastapi.responses import FileResponse
from pathlib import Path
from sympy import symbols, factor, latex, expand
from random import sample, randint, choice
from fractions import Fraction
from math import lcm, gcd
from typing import Literal
from uuid import uuid4

app = FastAPI(
    title="Practice Online - Dynamic Practice",
    description="Dynamic Mathematics Learning Engine",
    docs_url=None, redoc_url=None, openapi_url=None,
    version="2.0.0"
)

# Internal service: fails closed if no shared secret is configured.
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
    return {
        "platform": "Practice Online",
        "engine": "Dynamic Practice",
        "version": "2.0.0",
        "status": "Running"
    }

@app.get("/health")
def health():
    return {"status": "healthy"}


# Local prototype: bounded in-memory question records, limited attempts per question.
records = OrderedDict()
record_lock = Lock()
TTL = 1800
MAX_RECORDS = 5000
MAX_PER_LEARNER = 5

class Submission(BaseModel):
    question_id: str = Field(max_length=36)
    answer: str = Field(min_length=1, max_length=160)
    request_id: str = Field(min_length=1, max_length=80)


from engines import mathjax
from engines import whole_numbers, integers, common_fractions, factorisation
from engines.marking import mark_answer

CATALOG = {8: ['Whole Numbers', 'Integers', 'Common Fractions'], 10: ['Factorisation']}
SKILLS = {'Whole Numbers': ['BODMAS', 'HCF', 'LCM'], 'Integers': ['Combined Operations', 'Addition and Subtraction', 'Missing Values'], 'Common Fractions': ['Addition and Subtraction', 'Multiplying Fractions', 'Dividing Fractions', 'Combined Operations'], 'Factorisation': ['Trinomials', 'Difference of Two Squares']}
ENGINES = {'Whole Numbers': whole_numbers, 'Integers': integers, 'Common Fractions': common_fractions, 'Factorisation': factorisation}

@app.get('/api/mathematics/catalog')
def catalog():
    return CATALOG

@app.get('/api/mathematics/skills')
def skill_catalog():
    return SKILLS

@app.get('/api/mathematics/generate')
def generate_question(request: Request, response: Response, grade: int=10, topic: str='Factorisation', level: Literal['foundation','advanced']='foundation', skill: str='Mixed Practice'):
    response.headers['Cache-Control']='no-store'
    if topic not in CATALOG.get(grade,[]): raise HTTPException(400,'Choose a supported grade and topic.')
    if skill != 'Mixed Practice' and skill not in SKILLS[topic]: raise HTTPException(400,'Choose a supported subtopic.')
    selected = choice(SKILLS[topic]) if skill == 'Mixed Practice' else skill
    q,instruction,kind,value,private,hint=ENGINES[topic].generate(level,selected)
    question_id=str(uuid4())
    with record_lock:
        while records and (len(records)>=MAX_RECORDS or next(iter(records.values()))['expires']<=time.monotonic()): records.popitem(last=False)
        owned = [key for key, item in records.items() if item['owner'] == request.state.owner]
        while len(owned) >= MAX_PER_LEARNER:
            records.pop(owned.pop(0), None)
        records[question_id]={'owner':request.state.owner,'kind':kind,'value':value,'private':private,'hint':hint,'expires':time.monotonic()+TTL,'result':None,'tries':0,'requests':{}}
    return {'question_id':question_id,'grade':grade,'subject':'Mathematics','topic':topic,'subtopic':selected,'practice_category':'dynamic','practice_level':level,'difficulty':'moderate' if level=='advanced' else 'easy','type':'text','points':2,'instruction':instruction,'question':q,'question_mathjax':mathjax(q),'answer_kind':kind}

MAX_TRIES = 2

@app.post("/api/mathematics/submit")
def submit_answer(submission: Submission, response: Response, request: Request):
    response.headers["Cache-Control"] = "no-store"
    with record_lock:
        record = records.get(submission.question_id)
        if record is None or record["owner"] != request.state.owner or record["expires"] <= time.monotonic():
            raise HTTPException(404, "Question expired or server restarted. Generate a new question.")
        previous = record["requests"].get(submission.request_id)
        if previous:
            if previous[0] != submission.answer:
                raise HTTPException(409, "Request ID already used for another answer.")
            return previous[1]
        if record["result"] is not None:
            raise HTTPException(409, "This question is complete. Generate a new question.")
        correct, message = mark_answer(submission.answer, record)
        if correct is None:
            return {"status": "invalid", "message": message, "complete": False,
                    "tries": record["tries"], "remaining": MAX_TRIES-record["tries"]}
        record["tries"] += 1
        complete = correct or record["tries"] >= MAX_TRIES
        result = {"question_id": submission.question_id, "status": "correct" if correct else "incorrect",
                  "correct": correct, "complete": complete, "tries": record["tries"],
                  "remaining": MAX_TRIES-record["tries"], "first_try_correct": correct and record["tries"] == 1,
                  "message": message if correct else ("Not quite. Check your calculations, then try again." if not complete else "Review the worked solution before continuing.")}
        if complete:
            result.update(record["private"])
            record["result"] = result
        record["requests"][submission.request_id] = (submission.answer, result)
        return result

@app.get("/api/mathematics/hint/{question_id}")
def get_hint(question_id: str, response: Response, request: Request):
    response.headers["Cache-Control"] = "no-store"
    with record_lock:
        record = records.get(question_id)
        if record is None or record["owner"] != request.state.owner or record["expires"] <= time.monotonic():
            raise HTTPException(404, "Question expired. Generate a new question.")
        return {"hint": record["hint"]}