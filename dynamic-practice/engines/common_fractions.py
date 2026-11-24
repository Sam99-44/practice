




from . import mathjax, sections, frac
from random import randint, choice, sample
from fractions import Fraction
from math import gcd, lcm
from sympy import symbols, expand, factor, latex, Rational

def generate(level, skill):
    advanced = level == "advanced"
    instruction = "Calculate:"
    kind = "integer"
    if skill in ('Multiplying Fractions','Dividing Fractions'):
        kind='fraction'; instruction='Calculate. Give your answer in its simplest form.'
        a,b,c,d=randint(1,8),randint(2,12),randint(1,8),randint(2,12)
        if advanced: a+=b; c+=d
        divide=skill=='Dividing Fractions'
        op=r'\div' if divide else r'\times'
        q=frac(a,b)+op+frac(c,d)
        u,v=(d,c) if divide else (c,d)
        value=Fraction(a*u,b*v); ans=latex(Rational(value.numerator,value.denominator))
        formula=r'\frac{a}{b}\div\frac{c}{d}=\frac{a}{b}\times\frac{d}{c}' if divide else r'\frac{a}{b}\times\frac{c}{d}=\frac{ac}{bd}'
        reason='Multiply by the reciprocal of the second fraction.' if divide else 'Multiply the numerators and multiply the denominators.'
        calc=[]
        if divide: calc+=['Rewrite division as multiplication.',mathjax(q+'='+frac(a,b)+r'\times'+frac(u,v))]
        calc+=['Multiply and simplify.',mathjax(rf'{"=" if divide else q+"="}{frac(a*u,b*v)}={ans}')]
        hint=reason
    else:
        kind='fraction'; instruction='Calculate. Give your answer in its simplest form.'
        b,d=sample(range(6,19) if advanced else range(3,13),2); a,c=randint(1,b-1),randint(1,d-1)
        if skill=='Combined Operations':
            e,f=randint(2,5),randint(6,10); q=rf'{frac(a,b)}+{frac(c,d)}\times {frac(e,f)}'; m=Fraction(c*e,d*f); value=Fraction(a,b)+m
            l=lcm(b,m.denominator); n1=a*(l//b); n2=m.numerator*(l//m.denominator)
            calc=['Multiply before adding.',mathjax(rf'{q}={frac(a,b)}+{frac(c*e,d*f)}={frac(a,b)}+{frac(m.numerator,m.denominator)}'),f'The LCM of {b} and {m.denominator} is {l}.',mathjax(rf'={frac(n1,l)}+{frac(n2,l)}={frac(n1+n2,l)}')]; hint='Multiply the last two fractions first, then use a common denominator.'
        else:
            sign=choice([1,-1]); op='+' if sign==1 else '-'; q=rf'{frac(a,b)}{op}{frac(c,d)}'; value=Fraction(a,b)+sign*Fraction(c,d)
            l=lcm(b,d); n1=a*(l//b); n2=c*(l//d)
            calc=[f'The LCM of {b} and {d} is {l}.',mathjax(rf'{q}={frac(n1,l)}{op}{frac(n2,l)}={frac(n1+sign*n2,l)}')]; hint='Find the lowest common denominator before adding or subtracting.'
        ans=latex(__import__('sympy').Rational(value.numerator,value.denominator)); calc+=['Simplify the fraction.',mathjax('='+ans)]; formula=r'\frac{a}{m}+\frac{b}{m}=\frac{a+b}{m},\quad\frac{a}{m}-\frac{b}{m}=\frac{a-b}{m}' if not advanced else r'\frac{a}{b}\times\frac{c}{d}=\frac{ac}{bd}' ; reason='Use BODMAS and rewrite fractions with a common denominator before adding or subtracting.'
    if kind=='integer': ans=str(value)
    private={'answer':ans,'answer_mathjax':mathjax(ans),'solution':sections(q,formula,reason,calc,ans)}
    return q, instruction, kind, value, private, hint