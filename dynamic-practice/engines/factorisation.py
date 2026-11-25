



"""Grade 10 factorisation: typed questions and optional six-choice MCQs.

This module preserves the existing generate(level, skill) SIX-VALUE return contract.
The API endpoint must expose private['mcq_options'] to the learner as `options`,
while keeping private['correct_choice'] server-side. See the integration note.
"""
from . import mathjax, sections, frac
from random import randint, choice, sample, shuffle, random
from fractions import Fraction
from math import gcd, lcm
from sympy import symbols, expand, factor, latex, Rational, Mul

MCQ_PROBABILITY = 0.40
LETTERS = "ABCDEF"


def _factor_pair(left, right):
    """Preserve the visible brackets rather than expanding products."""
    return Mul(left, right, evaluate=False)


def _build_mcq_options(x, correct, k, a, b, is_difference):
    """Return six choices, only one of which expands to the original polynomial."""
    correct_expanded = expand(correct)
    candidates = [correct]
    seen = {latex(correct)}

    def add(left, right):
        expr = _factor_pair(left, right)
        rendered = latex(expr)
        if rendered in seen or expand(expr - correct_expanded) == 0:
            return
        seen.add(rendered)
        candidates.append(expr)

    if is_difference:
        # Original correct expression: (kx-a)(kx+a).
        for delta in [0, 1, 2, -1, -2, 3]:
            c = max(1, a + delta)
            add(k*x - c, k*x - c)
            add(k*x + c, k*x + c)
            add(k*x - c, k*x + max(1, c + 1))
            add(k*x + c, k*x - max(1, c + 1))
    else:
        # Original correct expression: (kx-a)(x-b).
        for d in [0, 1, -1, 2, -2, 3]:
            aa = max(1, a + d)
            bb = max(1, b + d)
            add(k*x + aa, x - b)
            add(k*x - a, x + bb)
            add(k*x + aa, x + bb)
            add(k*x - aa, x - max(1, b + 1))
            add(k*x - max(1, a + 1), x - bb)

    if len(candidates) < 6:
        raise RuntimeError("Could not produce six distinct multiple-choice options")

    distractors = sample(candidates[1:], 5)
    chosen = [correct, *distractors]
    shuffle(chosen)
    correct_index = chosen.index(correct)

    options = [
        {"value": LETTERS[i], "mathjax": mathjax(latex(expr))}
        for i, expr in enumerate(chosen)
    ]
    return options, LETTERS[correct_index]


def generate(level, skill, question_type=None):
    """Return q, instruction, kind, value, private, hint.

    With question_type omitted, approximately 40% of calls generate MCQs.
    question_type='mcq' or 'text' forces a particular type (useful for tests).
    """
    advanced = level == "advanced"
    instruction = "Factorise fully:"
    kind = "factor"
    x = symbols("x")
    is_difference = skill == "Difference of Two Squares"

    if is_difference:
        k = choice([2, 3, 5]) if advanced else 1
        a = choice([i for i in range(2, 13) if gcd(i, k) == 1])
        kx = "x" if k == 1 else f"{k}x"
        correct = _factor_pair(k*x - a, k*x + a)
        value = expand(correct)
        q = latex(value)
        ans = latex(factor(value))
        formula = r"A^2-B^2=(A-B)(A+B)"
        reason = "Both terms are perfect squares and are separated by subtraction."
        calc = [
            "Rewrite both terms as squares.",
            mathjax(rf"{q}=({kx})^2-({a})^2"),
            "Apply the difference of two squares formula.",
            mathjax(rf"=({kx}-{a})({kx}+{a})"),
        ]
        hint = "Find the square root of each term and use opposite signs in the two brackets."
        b = None
    else:
        if advanced:
            k = choice([2, 3, 5])
            a = choice([i for i in range(1, 10) if gcd(i, k) == 1])
            b = randint(2, 12)
        else:
            k = 1
            a, b = sorted(sample(range(2, 13), 2))
        correct = _factor_pair(k*x - a, x - b)
        value = expand(correct)
        q = latex(value)
        ans = latex(factor(value))
        kx = "x" if k == 1 else f"{k}x"
        middle = k*b + a
        formula = r"(px+q)(rx+s)=prx^2+(ps+qr)x+qs"
        reason = f"Find two numbers whose product is {k*a*b} and whose sum is {-middle}."
        calc = [
            "Find the product and sum.",
            mathjax(rf"(\color{{blue}}{{-{k*b}}})(\color{{green}}{{-{a}}})={k*a*b}"),
            mathjax(rf"(\color{{blue}}{{-{k*b}}})+(\color{{green}}{{-{a}}})={-middle}"),
            "Rewrite the middle term.",
            mathjax(rf"{q}={latex(k*x*x)}-\color{{blue}}{{{k*b}x}}-\color{{green}}{{{a}x}}+{a*b}"),
            "Factorise by grouping.",
            mathjax(rf"={kx}(x-{b})-{a}(x-{b})"),
            mathjax(rf"=({kx}-{a})(x-{b})"),
        ]
        hint = f"Find two integers with product {k*a*b} and sum {-middle}, then split the middle term."

    private = {
        "answer": ans,
        "answer_mathjax": mathjax(ans),
        "solution": sections(q, formula, reason, calc, ans),
    }

    if question_type not in (None, "mcq", "text"):
        raise ValueError("question_type must be None, 'mcq' or 'text'")
    is_mcq = (random() < MCQ_PROBABILITY) if question_type is None else question_type == "mcq"
    if is_mcq:
        options, correct_choice = _build_mcq_options(x, correct, k, a, b, is_difference)
        kind = "mcq"
        # These are to be split by the API handler. NEVER return correct_choice
        # or the worked solution in the public /generate response.
        private["mcq_options"] = options
        private["correct_choice"] = correct_choice
        private["correct_expression"] = ans

    return q, instruction, kind, value, private, hint
