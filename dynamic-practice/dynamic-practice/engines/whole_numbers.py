




from . import mathjax, sections, frac
from random import randint, choice, sample
from fractions import Fraction
from math import gcd, lcm
from sympy import symbols, expand, factor, latex, Rational

def generate(level, skill):
    advanced = level == "advanced"
    instruction = "Calculate:"
    kind = "integer"
    if skill in ('HCF','LCM'):
        a,b=randint(6,30),randint(6,30)
        if advanced: a,b=a*2,b*3
        q=str(a)+r';\ '+str(b)
        instruction=f'Find the {skill} of these numbers.'
        value=gcd(a,b) if skill=='HCF' else lcm(a,b)
        from sympy import factorint
        def pf(n): return r'\times '.join(str(p)+(f'^{{{e}}}' if e>1 else '') for p,e in sorted(factorint(n).items()))
        formula=None
        reason='Use the common prime factors with the smallest powers.' if skill=='HCF' else 'Use all prime factors with the highest powers.'
        calc=['Write each number as a product of prime factors.',mathjax(f'{a}='+pf(a)),mathjax(f'{b}='+pf(b)), 'Apply the prime factor rule.',mathjax(rf'\text{{{skill}}}={value}')]
        hint=reason
    else:
        a,b,c = randint(12,99),randint(3,12),randint(2,9)
        if advanced:
            d = randint(2,9); q=rf'({a}+{b})\times {c}-{d}^2'; value=(a+b)*c-d*d
            if value < 0: d=2; q=rf'({a}+{b})\times {c}-{d}^2'; value=(a+b)*c-d*d
            calc=['Calculate the brackets and power.',mathjax(rf'{q}=({a+b})\times {c}-{d*d}'),'Multiply, then subtract.',mathjax(rf'={ (a+b)*c}-{d*d}={value}')]; hint='Use BODMAS: brackets and powers first, then multiplication and subtraction.'
        else:
            q=rf'{a}+{b}\times {c}'; value=a+b*c
            calc=['Multiply first.',mathjax(rf'{q}={a}+{b*c}'),'Add.',mathjax(rf'={value}')]; hint='Multiply before adding.'
        formula=None; reason='Use BODMAS to perform the operations in the correct order.'
    if kind=='integer': ans=str(value)
    private={'answer':ans,'answer_mathjax':mathjax(ans),'solution':sections(q,formula,reason,calc,ans)}
    return q, instruction, kind, value, private, hint