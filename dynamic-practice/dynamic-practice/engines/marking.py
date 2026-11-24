



import re
from math import gcd
from fractions import Fraction
from sympy import symbols, expand

def mark_answer(raw,record):
    text=re.sub(r'\s+','',raw.lower()).replace('−','-').replace('×','*').replace('·','*')
    kind=record['kind']; value=record['value']
    if kind=='factor':
        if '=' in text or 'or' in text: return None,'Factorise the expression rather than solving for x.'
        match=re.fullmatch(r'\(([^()]+)\)\*?\(([^()]+)\)',text)
        if not match: return None,'Write your answer as a product of two linear brackets.'
        x=symbols('x'); factors=[]
        for part in match.groups():
            part=part.replace("*x", "x")
            normal=re.fullmatch(r'([+-]?[0-9]{0,3})x([+-][0-9]{1,3})',part)
            reverse=re.fullmatch(r'([+-]?[0-9]{1,3})([+-][0-9]{0,3})x',part)
            if normal: co,con=normal.groups()
            elif reverse: con,co=reverse.groups()
            else: return None,'Use two linear brackets containing x and an integer.'
            coefficient=int(co+'1') if co in ('','+','-') else int(co)
            if not coefficient: return None,'Each bracket must contain a nonzero x term.'
            constant=int(con)
            if gcd(abs(coefficient),abs(constant))!=1: return None,'Factorise fully: remove common factors from the brackets.'
            factors.append(coefficient*x+constant)
        ok=expand(factors[0]*factors[1])==value
    elif kind=='integer':
        if not re.fullmatch(r'[+-]?\d{1,12}',text): return None,'Enter a whole number or integer, without calculations.'
        ok=int(text)==value
    else:
        if not re.fullmatch(r'[+-]?\d{1,12}(?:/\d{1,12})?',text): return None,'Enter a fraction such as 3/4 or an integer.'
        parts=text.split('/'); numerator=int(parts[0]); denominator=int(parts[1]) if len(parts)==2 else 1
        if not denominator: return None,'The denominator cannot be zero.'
        if gcd(abs(numerator),denominator)!=1: return None,'Simplify your fraction before submitting.'
        ok=Fraction(numerator,denominator)==value
    return ok,'Well done! Your answer is correct.' if ok else 'Not quite. Check your calculations and try again.'