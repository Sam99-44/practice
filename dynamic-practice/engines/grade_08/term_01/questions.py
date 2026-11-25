from random import randint, choice, sample, shuffle
from fractions import Fraction
from math import gcd, lcm, isqrt
from . import mathjax, sections

TOPICS = {
 'Whole Numbers': ['Properties of Whole Numbers','Prime Factors','HCF','LCM','Ratio and Rate','Financial Problems'],
 'Integers': ['Counting and Ordering','Addition and Subtraction','Multiplication and Division','Combined Operations','Properties of Integers','Word Problems'],
 'Common Fractions': ['Addition and Subtraction','Multiplying Fractions','Dividing Fractions','Fractions of Whole Numbers','Squares and Roots','Percentages','Equivalent Forms','Word Problems'],
 'Decimal Fractions': ['Ordering and Comparing','Rounding Off','Adding and Subtracting Decimals','Multiplying Decimals','Dividing Decimals','Equivalent Forms','Word Problems'],
 'Numeric and Geometric Patterns': ['Extending Numeric Patterns','Geometric Patterns','Tables and Rules','Finding a Term','Algebraic Relationships'],
}

def tex(v):
 if isinstance(v,Fraction):
  return rf'\dfrac{{{v.numerator}}}{{{v.denominator}}}' if v.denominator!=1 else str(v.numerator)
 return str(v)

def decimal(v):
 if isinstance(v,Fraction): return f'{float(v):.5f}'.rstrip('0').rstrip('.')
 return str(v)

def make(q, answer, explanation, formula='None.', hint='Identify the operation needed before calculating.', instruction='Calculate:',kind=None, calculation=None):
 if kind is None: kind='fraction' if isinstance(answer,Fraction) and answer.denominator!=1 else 'integer'
 if kind=='integer' and isinstance(answer,Fraction): answer=int(answer)
 if kind=='decimal': display=decimal(answer)
 elif isinstance(answer,Fraction): display=f'{answer.numerator}/{answer.denominator}' if answer.denominator!=1 else str(answer.numerator)
 else: display=tex(answer)
 steps=[explanation, mathjax(calculation or rf'{q}={tex(answer)}')]
 return q,instruction,kind,answer,formula,explanation,steps,hint,display

def build(topic,skill,advanced):
 a,b=randint(2,20),randint(2,15)
 if topic=='Whole Numbers':
  if skill=='Properties of Whole Numbers':
   a,b,c=randint(2,28),randint(3,20),randint(2,12)
   q=rf'{a}\times({b}+{c})'
   return make(q,a*(b+c),'Use the distributive property or calculate inside the brackets first.',r'a(b+c)=ab+ac','Multiply by both numbers inside the brackets.')
  if skill=='Prime Factors':
   p=choice([2,3,5,7]); other=choice([2,3,5,7]); n=p*other*choice([2,3,5])
   q=rf'{n}\div {p}'
   return make(q,n//p,f'Divide {n} by its prime factor {p}.','None.','Find the prime factors before dividing.',instruction='Calculate using prime factors:')
  if skill in ('HCF','LCM'):
   x,y=randint(2,14),randint(2,14); d=randint(2,5); n1,n2=x*d,y*d
   ans=gcd(n1,n2) if skill=='HCF' else lcm(n1,n2)
   q=rf'{n1};\ {n2}'
   return make(q,ans,f'Find the {"highest common factor" if skill=="HCF" else "lowest common multiple"} of {n1} and {n2}.','None.','List factors or multiples to check.',instruction=f'Find the {skill} of these numbers:')
  if skill=='Ratio and Rate':
   r,s=randint(2,7),randint(2,6); groups=randint(2,10); total=(r+s)*groups
   q=rf'\text{{Divide {total} in the ratio {r}:{s}. Find the first share.}}'
   return make(q,r*groups,f'There are {r+s} equal parts. Each part is {groups}; take {r} parts.',r'\text{Share}=\dfrac{\text{ratio part}}{\text{total ratio parts}}\times\text{total}','Add the ratio parts before finding the share.',instruction='Solve the ratio problem:')
  if skill=='Financial Problems':
   price=randint(6,25)*20; pc=choice([5,10,15,20,25]); amount=price*pc//100
   if advanced:
    q=rf'\text{{A R{price} item has a {pc}\% discount. Find the sale price in rand.}}'
    ans=price-amount; explanation=f'Calculate {pc}% of R{price} and subtract the discount.'
   else:
    q=rf'\text{{Find {pc}\% of R{price}.}}'; ans=amount; explanation=f'Convert {pc}% to a fraction of 100 and multiply by {price}.'
   return make(q,ans,explanation,r'\text{Percentage}=\dfrac{p}{100}\times\text{whole}','Convert the percentage to a fraction over 100.',instruction='Solve the financial problem:')
 if topic=='Integers':
  x=randint(-18,-3) if advanced else randint(-10,0); y=randint(2,16)
  if skill=='Counting and Ordering':
   q=rf'{x};\ {y};\ {x-3}'
   return make(q,x-3,'The smallest number is the furthest left on the number line.','None.','Compare positions on a number line.',instruction='Write the smallest integer:')
  if skill=='Addition and Subtraction':
   q=rf'({x})-({y})' if advanced else rf'{x}+{y}'
   ans=x-y if advanced else x+y
   return make(q,ans,'Adding or subtracting signed integers changes the position on the number line.','None.','Keep track of both signs.')
  if skill=='Multiplication and Division':
   u=randint(3,12); v=randint(2,9); q=rf'(-{u*v})\div({-v})' if advanced else rf'(-{u})\times {v}'
   return make(q,u if advanced else -u*v,'Two negative signs give a positive quotient; unlike signs give a negative product.','None.','Decide the sign before working with the numbers.')
  if skill=='Combined Operations':
   u=randint(3,12); v=randint(2,9); z=randint(2,10)
   q=rf'{x}+{u}\times {v}-{z}'
   return make(q,x+u*v-z,'Use BODMAS: multiplication before addition or subtraction.','None.','Calculate the multiplication first.')
  if skill=='Properties of Integers':
   u,v=randint(2,12),randint(2,9); q=rf'(-{u})\times({v}+{-3})'
   return make(q,-u*(v-3),'Apply the distributive property to signed integers.',r'a(b+c)=ab+ac','Multiply both terms by the outside factor.')
  if skill=='Word Problems':
   start=randint(-12,5); up=randint(3,20); down=randint(3,18)
   q=rf'\text{{The temperature is {start} degrees. It rises by {up} and falls by {down}. Find the final temperature.}}'
   return make(q,start+up-down,'Add the temperature increase and subtract the decrease.','None.','Rising means add; falling means subtract.',instruction='Solve the integer word problem:')
 if topic=='Common Fractions':
  den1,den2=randint(2,8),randint(2,9); num1,num2=randint(1,den1-1),randint(1,den2-1)
  f,g=Fraction(num1,den1),Fraction(num2,den2)
  if skill=='Addition and Subtraction':
   sign=choice(['+','-']) if advanced else '+'; ans=f+g if sign=='+' else f-g; q=rf'{tex(f)}{sign}{tex(g)}'
   return make(q,ans,'Use a common denominator, then add or subtract the numerators.',r'\dfrac{a}{b}+\dfrac{c}{d}=\dfrac{ad+bc}{bd}','Find a common denominator first.')
  if skill=='Multiplying Fractions':
   q=rf'{tex(f)}\times {tex(g)}'; ans=f*g
   return make(q,ans,'Multiply the numerators and the denominators, then simplify.',r'\dfrac{a}{b}\times\dfrac{c}{d}=\dfrac{ac}{bd}','Look for cancellation before multiplying.')
  if skill=='Dividing Fractions':
   q=rf'{tex(f)}\div {tex(g)}'; ans=f/g
   return make(q,ans,'Change division to multiplication by the reciprocal.',r'\dfrac{a}{b}\div\dfrac{c}{d}=\dfrac{a}{b}\times\dfrac{d}{c}','Invert the second fraction.')
  if skill=='Fractions of Whole Numbers':
   den=randint(2,9); num=randint(1,den-1); whole=den*randint(3,15)
   q=rf'{tex(Fraction(num,den))}\text{{ of }}{whole}'
   return make(q,num*(whole//den),'Multiply the fraction by the whole number.',r'\text{Fraction of a number}=\text{fraction}\times\text{number}','Divide the whole number by the denominator first.')
  if skill=='Squares and Roots':
   n=randint(2,12); q=rf'\sqrt{{{n*n}}}'
   return make(q,n,f'Find the positive number whose square is {n*n}.',r'\sqrt{n^2}=n','Use the square and square-root relationship.')
  if skill=='Percentages':
   pc=choice([10,20,25,30,40,50,75]); whole=randint(4,16)*20
   q=rf'{pc}\%\text{{ of }}{whole}'
   return make(q,Fraction(pc*whole,100),'Convert the percentage to a fraction over 100 and multiply.',r'p\%=\dfrac{p}{100}','Convert the percentage before multiplying.')
  if skill=='Equivalent Forms':
   den=choice([2,4,5,10,20]); num=randint(1,den-1); q=rf'{num}\div {den}'
   return make(q,Fraction(num,den),'A division can be expressed as a simplified common fraction.','None.','Write the numerator over the denominator and simplify.',instruction='Write as a simplified fraction:')
  if skill=='Word Problems':
   den=randint(2,9); num=randint(1,den-1); total=den*randint(4,20)
   q=rf'\text{{A class has {total} learners. {tex(Fraction(num,den))} of them are absent. How many are absent?}}'
   return make(q,total*num//den,'Calculate the fraction of the total number of learners.','None.','Find one equal part, then multiply by the numerator.',instruction='Solve the fraction word problem:')
 if topic=='Decimal Fractions':
  a=Fraction(randint(11,89),100 if advanced else 10); b=Fraction(randint(11,79),100 if advanced else 10)
  if skill=='Ordering and Comparing':
   third=Fraction(randint(10,99),100 if advanced else 10)
   q=rf'{decimal(a)};\ {decimal(b)};\ {decimal(third)}'
   return make(q,max(a,b,third),'Compare digits using place value, beginning with whole-number parts.','None.','Align the decimal points.',instruction='Write the largest number:',kind='decimal')
  if skill=='Rounding Off':
   n=randint(100,999); a=Fraction(n,1000)
   ans=Fraction((n+5)//10,100) if n%10>=5 else Fraction(n//10,100)
   q=decimal(a)
   return make(q,ans,'Look at the third decimal digit to round to two decimal places.','None.','Five or more means round the previous digit up.',instruction='Round to TWO decimal places:',kind='decimal')
  if skill=='Adding and Subtracting Decimals':
   sign=choice(['+','-']); ans=a+b if sign=='+' else a-b; q=rf'{decimal(a)} {sign} {decimal(b)}'
   return make(q,ans,'Align decimal places and calculate.','None.','Use place value to line up the digits.',kind='decimal')
  if skill=='Multiplying Decimals':
   ans=a*b; q=rf'{decimal(a)}\times {decimal(b)}'
   return make(q,ans,'Multiply using fraction values, then place the decimal point.','None.','Count decimal places in both factors.',kind='decimal')
  if skill=='Dividing Decimals':
   divisor=Fraction(randint(1,9),10); quotient=randint(2,12); dividend=divisor*quotient
   q=rf'{decimal(dividend)}\div {decimal(divisor)}'
   return make(q,quotient,'Multiply dividend and divisor by 10 to remove the divisor decimal.','None.','Convert the divisor to a whole number.')
  if skill=='Equivalent Forms':
   denominator=choice([2,4,5,10,20,25]); numerator=randint(1,denominator-1)
   val=Fraction(numerator,denominator); q=rf'{tex(val)}'
   return make(q,val,'Convert the common fraction to its equivalent decimal value.','None.','Divide the numerator by the denominator.',kind='decimal',instruction='Write as a decimal:')
  if skill=='Word Problems':
   price=Fraction(randint(15,70),10); count=randint(3,9); q=rf'\text{{One item costs R{decimal(price)}. Find the cost of {count} items in rand.}}'
   return make(q,price*count,'Multiply the price per item by the number of items.','None.','Multiply the number of items by the unit price.',kind='decimal',instruction='Solve the decimal word problem:')
 if topic=='Numeric and Geometric Patterns':
  first=randint(2,15); diff=randint(2,9)*(-1 if advanced and choice([True,False]) else 1)
  terms=[first+i*diff for i in range(4)]
  if skill=='Extending Numeric Patterns':
   q=r';\ '.join(map(str,terms))+r';\ \ldots'
   return make(q,first+4*diff,'Calculate the constant difference between consecutive terms.',r'T_n=a+(n-1)d','Subtract neighbouring terms.',instruction='Find the next term:')
  if skill=='Geometric Patterns':
   ratio=randint(2,3); first=randint(1,4); terms=[first*ratio**i for i in range(4)]
   q=r';\ '.join(map(str,terms))+r';\ \ldots'
   return make(q,first*ratio**4,'Each term is obtained by multiplying by the common ratio.',r'T_n=ar^{n-1}','Divide each term by the previous term.',instruction='Find the next term:')
  if skill=='Tables and Rules':
   c=randint(1,8); k=randint(2,7); x=randint(5,12)
   q=rf'\text{{Rule: multiply the input by {k}, then add {c}. Find the output for input {x}.}}'
   return make(q,k*x+c,'Apply the same rule to the given input.',rf'T_n={k}n+{c}','Multiply first, then add.',instruction='Use the pattern rule:')
  if skill=='Finding a Term':
   n=randint(7,15); q=rf'{terms[0]};\ {terms[1]};\ {terms[2]};\ \ldots\quad T_{{{n}}}'
   return make(q,first+(n-1)*diff,f'The first term is {first} and the difference is {diff}.',r'T_n=a+(n-1)d','Use the term position in the arithmetic rule.',instruction=f'Find term {n}:')
  if skill=='Algebraic Relationships':
   n=randint(4,12); k=randint(2,7); c=randint(1,8)
   q=rf'T_n={k}n+{c},\quad n={n}'
   return make(q,k*n+c,f'Substitute {n} for n in the pattern rule.',rf'T_n={k}n+{c}','Replace n with the required term number.',instruction='Calculate the term using the rule:')
 raise ValueError(f'Unsupported Grade 8 Term 1 skill: {topic} / {skill}')

def generate(level,skill,question_type=None,topic=None):
 if level not in ('foundation','advanced') or topic not in TOPICS or skill not in TOPICS[topic]:
  raise ValueError('Unsupported topic, subtopic or practice level')
 if question_type not in (None,'text','mcq'): raise ValueError('Unsupported question type')
 q,instruction,kind,value,formula,reason,steps,hint,answer=build(topic,skill,level=='advanced')
 private={'answer':answer,'answer_mathjax':mathjax(tex(value) if kind!='decimal' else decimal(value)),
          'solution':sections(q,formula,reason,steps,answer)}
 if question_type == 'mcq':
  candidates=[]
  if isinstance(value,Fraction):
   adjustments=[Fraction(1,100),Fraction(1,20),Fraction(1,10),Fraction(1,4),Fraction(1,2),Fraction(1),Fraction(2),Fraction(3),Fraction(5)]
  else: adjustments=[1,2,3,4,5,6,7,8,10,12,15]
  for delta in adjustments:
   candidates.extend([value+delta,value-delta])
  candidates.extend([-value,value*2,value+10,value-10])
  choices=[]
  for candidate in candidates:
   if candidate!=value and candidate not in choices: choices.append(candidate)
  if len(choices)<5: raise ValueError('Insufficient distinct MCQ options')
  selections=[value]+sample(choices,5); shuffle(selections)
  render=(decimal if kind=='decimal' else tex)
  options=[{'value':'ABCDEF'[i],'mathjax':mathjax(render(v))} for i,v in enumerate(selections)]
  private['mcq_options']=options
  private['correct_choice']='ABCDEF'[selections.index(value)]
  kind='mcq'
 return q,instruction,kind,value,private,hint
