import re
from math import gcd
from fractions import Fraction
from sympy import symbols, expand


def mark_answer(raw, record):
    """Return (correct: bool | None, feedback: str).

    None denotes an invalid input and should not consume a valid attempt.
    The caller remains responsible for authentication, ownership, attempt limits,
    question completion, and recording results.
    """
    if not isinstance(raw, str):
        return None, 'Enter your answer before submitting.'

    text = re.sub(r'\s+', '', raw.lower()).replace('−', '-').replace('×', '*').replace('·', '*')
    kind = record['kind']

    # Multiple-choice questions have six options, A through F.
    # The correct letter is kept in the SERVER-SIDE question record.
    if kind == 'mcq':
        selected = text.upper()
        if not re.fullmatch(r'[A-F]', selected):
            return None, 'Select one answer from A to F.'

        private = record.get('private') if isinstance(record.get('private'), dict) else {}
        correct_choice = record.get('correct_choice') or private.get('correct_choice')
        if not isinstance(correct_choice, str) or not re.fullmatch(r'[A-F]', correct_choice.upper()):
            # This is a server integration error, not an incorrect learner answer.
            raise ValueError('MCQ question is missing a valid server-side correct_choice.')
        ok = selected == correct_choice.upper()
        return ok, ('Well done! Your answer is correct.' if ok
                    else 'Not quite. Check your calculations and try again.')

    value = record['value']
    if kind == 'factor':
        if '=' in text or 'or' in text:
            return None, 'Factorise the expression rather than solving for x.'
        match = re.fullmatch(r'\(([^()]+)\)\*?\(([^()]+)\)', text)
        if not match:
            return None, 'Write your answer as a product of two linear brackets.'

        x = symbols('x')
        factors = []
        for part in match.groups():
            part = part.replace('*x', 'x')
            normal = re.fullmatch(r'([+-]?[0-9]{0,3})x([+-][0-9]{1,3})', part)
            reverse = re.fullmatch(r'([+-]?[0-9]{1,3})([+-][0-9]{0,3})x', part)
            if normal:
                co, con = normal.groups()
            elif reverse:
                con, co = reverse.groups()
            else:
                return None, 'Use two linear brackets containing x and an integer.'
            coefficient = int(co + '1') if co in ('', '+', '-') else int(co)
            if not coefficient:
                return None, 'Each bracket must contain a nonzero x term.'
            constant = int(con)
            if gcd(abs(coefficient), abs(constant)) != 1:
                return None, 'Factorise fully: remove common factors from the brackets.'
            factors.append(coefficient*x + constant)
        ok = expand(factors[0] * factors[1]) == value

    elif kind == 'integer':
        if not re.fullmatch(r'[+-]?\d{1,12}', text):
            return None, 'Enter a whole number or integer, without calculations.'
        ok = int(text) == value

    else:
        if not re.fullmatch(r'[+-]?\d{1,12}(?:/\d{1,12})?', text):
            return None, 'Enter a fraction such as 3/4 or an integer.'
        parts = text.split('/')
        numerator = int(parts[0])
        denominator = int(parts[1]) if len(parts) == 2 else 1
        if not denominator:
            return None, 'The denominator cannot be zero.'
        if gcd(abs(numerator), denominator) != 1:
            return None, 'Simplify your fraction before submitting.'
        ok = Fraction(numerator, denominator) == value

    return ok, ('Well done! Your answer is correct.' if ok
                else 'Not quite. Check your calculations and try again.')
