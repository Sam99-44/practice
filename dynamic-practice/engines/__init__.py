def mathjax(expression):
    return r"\(\displaystyle " + expression + r"\)"



def sections(q, formula, reason, calculations, answer):
    return [{'heading': h, 'content': c} for h,c in [
        ('Given',[mathjax(q)]), ('Formula',[mathjax(formula) if formula else 'None.']),
        ('Reason',[reason]), ('Calculations',calculations),
        ('Final Answer',[mathjax(r'\boxed{'+answer+'}')])]]

def frac(n,d):
    return rf'\frac{{{n}}}{{{d}}}'
