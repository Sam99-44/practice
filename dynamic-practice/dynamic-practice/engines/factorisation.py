



from . import mathjax, sections, frac
from random import randint, choice, sample
from fractions import Fraction
from math import gcd, lcm
from sympy import symbols, expand, factor, latex, Rational

def generate(level, skill):
    advanced = level == "advanced"
    instruction = "Calculate:"
    kind = "integer"
    if skill=='Difference of Two Squares':
        kind='factor'; instruction='Factorise fully:'; x=symbols('x')
        k=choice([2,3,5]) if advanced else 1
        a=choice([i for i in range(2,13) if gcd(i,k)==1])
        kx='x' if k==1 else f'{k}x'; value=expand((k*x-a)*(k*x+a)); q=latex(value); ans=latex(factor(value))
        formula=r'A^2-B^2=(A-B)(A+B)'; reason='Both terms are perfect squares and are separated by subtraction.'
        calc=['Rewrite both terms as squares.',mathjax(rf'{q}=({kx})^2-({a})^2'),'Apply the difference of two squares formula.',mathjax(rf'=({kx}-{a})({kx}+{a})')]; hint='Find the square root of each term and use opposite signs in the two brackets.'
    else:
        kind='factor'; instruction='Factorise fully:'; x=symbols('x')
        if advanced:
            k=choice([2,3,5]); a=choice([i for i in range(1,10) if gcd(i,k)==1]); b=randint(2,12)
        else: k=1; a,b=sorted(sample(range(2,13),2))
        expression=expand((k*x-a)*(x-b)); value=expression; q=latex(expression); ans=latex(factor(expression)); kx='x' if k==1 else f'{k}x'; middle=k*b+a
        formula=r'(px+q)(rx+s)=prx^2+(ps+qr)x+qs'; reason=f'Find two numbers whose product is {k*a*b} and whose sum is {-middle}.'
        calc=['Find the product and sum.',mathjax(rf'(\color{{blue}}{{-{k*b}}})(\color{{green}}{{-{a}}})={k*a*b}'),mathjax(rf'(\color{{blue}}{{-{k*b}}})+(\color{{green}}{{-{a}}})={-middle}'),'Rewrite the middle term.',mathjax(rf'{q}={latex(k*x*x)}-\color{{blue}}{{{k*b}x}}-\color{{green}}{{{a}x}}+{a*b}'),'Factorise by grouping.',mathjax(rf'={kx}(x-{b})-{a}(x-{b})'),mathjax(rf'=({kx}-{a})(x-{b})')]; hint=f'Find two integers with product {k*a*b} and sum {-middle}, then split the middle term.'
    if kind=='integer': ans=str(value)
    private={'answer':ans,'answer_mathjax':mathjax(ans),'solution':sections(q,formula,reason,calc,ans)}
    return q, instruction, kind, value, private, hint