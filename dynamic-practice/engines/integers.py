




from . import mathjax, sections, frac
from random import randint, choice, sample
from fractions import Fraction
from math import gcd, lcm
from sympy import symbols, expand, factor, latex, Rational

def generate(level, skill):
    advanced = level == "advanced"
    instruction = "Calculate:"
    kind = "integer"
    if skill=='Addition and Subtraction':
        a,b,c=randint(2,25),randint(2,25),randint(2,25)
        q=rf'(-{a})-(-{b})'+(rf'-{c}' if advanced else '')
        value=-a+b-(c if advanced else 0)
        formula=r'a-(-b)=a+b'; reason='Subtracting a negative integer is the same as adding its opposite.'
        calc=['Change subtraction of a negative to addition.',mathjax(rf'{q}=-{a}+{b}'+(f'-{c}' if advanced else '')),mathjax(f'={value}')]; hint=reason
    elif skill=='Missing Values':
        a,b=randint(2,20),randint(2,20)
        value=-b if advanced else b
        q=rf'{a}\times \square={a*value}' if advanced else rf'(-{a})+\square={value-a}'
        instruction='Find the missing integer.'
        formula=None; reason='Use the inverse operation to isolate the missing integer.'
        calc=['Divide both sides by the given factor.' if advanced else 'Add the opposite of the given integer.',mathjax(rf'\square={a*value}\div {a}={value}' if advanced else rf'\square={value-a}+{a}={value}')]; hint=reason
    else:
        a,b,c,d=randint(2,12),randint(2,12),randint(2,9),randint(2,9)
        if advanced:
            q=rf'(-{a*b})\div {a}+(-{c*d})\div(-{c})'; value=-b+d
            calc=['Divide each pair of integers.',mathjax(rf'{q}=(-{b})+{d}'),'Add the integers.',mathjax(rf'={value}')]; hint='Different signs give a negative quotient; matching signs give a positive quotient.'
        else:
            q=rf'(-{a})\times {b}'; value=-a*b
            calc=['Multiply the numbers and apply the sign rule.',mathjax(rf'{q}={value}')]; hint='A negative number multiplied by a positive number gives a negative answer.'
        formula=None; reason='Apply the sign rules for integers and follow BODMAS where needed.'
    if kind=='integer': ans=str(value)
    private={'answer':ans,'answer_mathjax':mathjax(ans),'solution':sections(q,formula,reason,calc,ans)}
    return q, instruction, kind, value, private, hint