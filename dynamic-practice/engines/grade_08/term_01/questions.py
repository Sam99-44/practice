"""Grade 8 Term 1 ATP topic generator — typed answers and six-option MCQs.

All question values are created on demand; answer keys remain server-side.
Designed for Practice Online's existing generate(level, skill, question_type, topic) API.
"""
from random import randint, choice, sample, shuffle
from fractions import Fraction
from math import gcd, lcm, isqrt
from threading import Lock
from ... import mathjax, sections

TOPICS = {
 'Whole Numbers': ['Introduction','Ordering and comparing whole numbers','Properties of whole numbers','Calculations using whole numbers','Multiples and factors','Ratio and rate','Solving problems with whole numbers','Working with money: Budgets, savings, discount, interest and exchange rates'],
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


# Each level cycles through a shuffled set of *different mathematical tasks*.
# This avoids repeating a template within a short practice run in a single worker.
# For guaranteed per-session variety across multiple workers/restarts, the API must
# eventually pass a session ID and maintain a session-scoped question plan.
_RATIO_MODES = {
 'foundation': [
  'simplify', 'increase', 'decrease', 'share_two', 'missing_part',
  'unit_rate', 'distance', 'time', 'equivalent_ratio',
  'recipe_scale', 'fractional_share', 'compare_rates',
 ],
 'advanced': [
  'reverse_increase', 'reverse_decrease', 'share_three', 'known_share',
  'combined_ratio', 'rate_total', 'fractional_share', 'compare_rates',
  'two_stage_rate', 'ratio_transfer', 'share_difference', 'combined_journey',
  'ratio_after_loss', 'mixture_fraction',
 ],
}
_ratio_lock = Lock()
_ratio_decks = {'foundation': [], 'advanced': []}

def _next_ratio_mode(advanced):
 level = 'advanced' if advanced else 'foundation'
 with _ratio_lock:
  if not _ratio_decks[level]:
   _ratio_decks[level] = list(_RATIO_MODES[level])
   shuffle(_ratio_decks[level])
  return _ratio_decks[level].pop()

def ratio_rate(advanced):
 """Different ratio/rate reasoning tasks, not just replacement values."""
 mode = _next_ratio_mode(advanced)
 if mode=='simplify':
  a,b=sample(range(2,12),2)
  while gcd(a,b)!=1: a,b=sample(range(2,12),2)
  common=randint(2,12)
  q=rf'{a*common}:{b*common}'
  return make(q,a,'Divide both parts of the ratio by their highest common factor.',r'a:b=\dfrac{a}{d}:\dfrac{b}{d}',f'The same positive number divides both parts.',instruction='Simplify the ratio fully. Enter the first part of the simplified ratio:',calculation=rf'{a*common}:{b*common}={a}:{b}')
 if mode in ('increase','decrease'):
  oldpart=randint(2,8)
  newpart=oldpart+randint(1,6) if mode=='increase' else randint(1,oldpart-1)
  onepart=randint(3,20); original=oldpart*onepart; result=newpart*onepart
  q=rf'\text{{A quantity of {original} is changed in the ratio {newpart}:{oldpart} (new:old). Find the new quantity.}}'
  return make(q,result,f'The old quantity represents {oldpart} parts. One part is {original} divided by {oldpart}; the new quantity represents {newpart} parts.',r'\text{New}=\text{Old}\times\dfrac{\text{new ratio part}}{\text{old ratio part}}','Identify how many parts represent the old quantity.',instruction='Solve the ratio problem:',calculation=rf'{original}\times\dfrac{{{newpart}}}{{{oldpart}}}={result}')
 if mode=='share_two':
  a,b=sample(range(2,10),2); part=randint(3,20); total=(a+b)*part
  q=rf'\text{{Two teams share {total} points in the ratio {a}:{b}. How many points does the first team receive?}}'
  return make(q,a*part,f'There are {a+b} parts altogether. Each part is worth {part} points. The first team receives {a} parts.',r'\text{Share}=\dfrac{\text{person parts}}{\text{total parts}}\times\text{whole}','Add both ratio parts before finding one share.',instruction='Solve the sharing problem:',calculation=rf'\dfrac{{{a}}}{{{a+b}}}\times {total}={a*part}')
 if mode=='missing_part':
  a,b=sample(range(2,10),2); part=randint(3,16); known=a*part
  q=rf'\text{{At a sports day, the ratio of red to blue flags is {a}:{b}. There are {known} red flags. How many blue flags are there?}}'
  return make(q,b*part,f'{a} parts correspond to {known} flags, so one part is {part}. Blue flags account for {b} parts.',r'\text{Unknown}=\dfrac{\text{unknown parts}}{\text{known parts}}\times\text{known}','Use the known number of red flags to find one part.',instruction='Solve the ratio problem:',calculation=rf'\dfrac{{{b}}}{{{a}}}\times {known}={b*part}')
 if mode=='unit_rate':
  rate=randint(6,35); minutes=randint(3,11); quantity=rate*minutes
  q=rf'\text{{A machine fills {quantity} bottles in {minutes} minutes at a constant rate. How many bottles does it fill per minute?}}'
  return make(q,rate,'Divide the total number of bottles by the number of minutes.',r'\text{Rate}=\dfrac{\text{quantity}}{\text{time}}','Calculate the amount for one minute.',instruction='Calculate the rate:',calculation=rf'{quantity}\div {minutes}={rate}')
 if mode=='distance':
  speed=choice([30,40,45,50,60,70,80,90]); hours=randint(2,8)
  q=rf'\text{{A bus travels at {speed} km/h for {hours} hours. How many kilometres does it travel?}}'
  return make(q,speed*hours,'At a constant speed, multiply speed by time.',r'\text{Distance}=\text{speed}\times\text{time}','Distance depends on the speed and the time travelled.',instruction='Calculate the distance:',calculation=rf'{speed}\times {hours}={speed*hours}')
 if mode=='time':
  speed=choice([30,40,50,60,80]); hours=randint(2,9); distance=speed*hours
  q=rf'\text{{A cyclist covers {distance} km at a constant rate of {speed} km/h. How many hours does the journey take?}}'
  return make(q,hours,'Divide the total distance by the distance covered in one hour.',r'\text{Time}=\dfrac{\text{distance}}{\text{speed}}','Use the distance travelled in each hour.',instruction='Calculate the time:',calculation=rf'{distance}\div {speed}={hours}')
 if mode in ('reverse_increase','reverse_decrease'):
  oldpart=randint(2,8); newpart=oldpart+randint(1,5) if mode=='reverse_increase' else randint(1,oldpart-1)
  onepart=randint(4,18); new_amount=newpart*onepart; old_amount=oldpart*onepart
  q=rf'\text{{After a quantity changes in the ratio {newpart}:{oldpart} (new:old), it becomes {new_amount}. Find the original quantity.}}'
  return make(q,old_amount,f'The new quantity represents {newpart} parts. One part is {new_amount} divided by {newpart}; the original amount is {oldpart} parts.',r'\text{Old}=\text{New}\times\dfrac{\text{old parts}}{\text{new parts}}','Work backwards using the ratio of the new amount to the original.',instruction='Find the original quantity:',calculation=rf'{new_amount}\times\dfrac{{{oldpart}}}{{{newpart}}}={old_amount}')
 if mode=='share_three':
  a,b,c=sample(range(2,10),3); part=randint(4,18); total=(a+b+c)*part
  q=rf'\text{{Three friends divide R{total} in the ratio {a}:{b}:{c}. How many rand does the second friend receive?}}'
  return make(q,b*part,f'The ratio has {a+b+c} parts in total. One part is R{part}, so the second friend receives {b} parts.',r'\text{Share}=\dfrac{\text{share parts}}{\text{total parts}}\times\text{whole}','Add all three ratio parts before dividing.',instruction='Solve the money-sharing problem:',calculation=rf'\dfrac{{{b}}}{{{a+b+c}}}\times {total}={b*part}')
 if mode=='known_share':
  a,b=sample(range(2,12),2); part=randint(4,18); known=a*part
  q=rf'\text{{A school has boys and girls in the ratio {a}:{b}. If there are {known} boys, how many learners are there altogether?}}'
  return make(q,(a+b)*part,f'The boys represent {a} parts, worth {part} learners per part. Both groups together represent {a+b} parts.',r'\text{Total}=\dfrac{\text{all parts}}{\text{known parts}}\times\text{known quantity}','Find the value of one part using the number of boys.',instruction='Find the total:',calculation=rf'\dfrac{{{a+b}}}{{{a}}}\times {known}={(a+b)*part}')
 if mode=='combined_ratio':
  a,b=sample(range(2,9),2); part=randint(5,18); total=(a+b)*part
  q=rf'\text{{In a class, learners choosing art and music are in the ratio {a}:{b}. There are {total} learners. How many more choose the more popular option?}}'
  return make(q,abs(a-b)*part,f'Each part represents {part} learners; the difference is {abs(a-b)} parts.',r'\text{Difference}=\dfrac{|a-b|}{a+b}\times\text{total}','Find the number represented by one ratio part.',instruction='Find the difference:',calculation=rf'\dfrac{{{abs(a-b)}}}{{{a+b}}}\times {total}={abs(a-b)*part}')
 if mode=='remaining_quantity':
  a,b=sample(range(2,10),2); part=randint(5,17); first=a*part; second=b*part
  q=rf'\text{{Boxes of apples and oranges are in the ratio {a}:{b}. There are {first} apple boxes. After {randint(1,3)} more apple boxes arrive, how many orange boxes were there originally?}}'
  return make(q,second,f'The ratio describes the original quantities, before any extra boxes arrive. {a} parts represent {first} apple boxes, so one part represents {part}.','None.','Ignore the later delivery when working with the original ratio.',instruction='Solve the ratio problem:',calculation=rf'\dfrac{{{b}}}{{{a}}}\times {first}={second}')
 if mode=='rate_total':
  machines=randint(2,5); per_machine=randint(7,24); minutes=randint(3,8)
  q=rf'\text{{Each of {machines} machines packs {per_machine} items per minute. All machines run for {minutes} minutes. How many items are packed altogether?}}'
  ans=machines*per_machine*minutes
  return make(q,ans,f'One machine packs {per_machine*minutes} items in {minutes} minutes. Multiply by {machines} machines.',r'\text{Total}=\text{machines}\times\text{rate}\times\text{time}','Find how many items one machine packs in the whole time.',instruction='Solve the rate problem:',calculation=rf'{machines}\times {per_machine}\times {minutes}={ans}')
 if mode=='fractional_share':
  a,b,c=sample(range(2,9),3); total=a+b+c; f=Fraction(b,total)
  q=rf'\text{{Three workers share earnings in the ratio {a}:{b}:{c}. What fraction of the total earnings belongs to the second worker?}}'
  return make(q,f,f'There are {total} parts altogether. The second worker receives {b} of these parts.',r'\text{Fraction}=\dfrac{\text{worker parts}}{\text{total parts}}','Add the three parts and simplify the fraction.',instruction='Give your answer as a simplified fraction:',calculation=rf'\dfrac{{{b}}}{{{total}}}={tex(f)}')
 if mode=='equivalent_ratio':
  a,b=sample(range(2,10),2); factor=randint(2,9)
  q=rf'\text{{The ratio of yellow beads to purple beads is {a}:{b}. A second bag keeps the same ratio and has {a*factor} yellow beads. How many purple beads must it have?}}'
  return make(q,b*factor,f'The yellow part grew from {a} to {a*factor}, a scale factor of {factor}. Apply that same factor to the purple part.',r'\text{Equivalent ratios multiply both parts by the same number.}','Find the scale factor for the yellow beads.',instruction='Complete the equivalent ratio:',calculation=rf'{a}:{b}={a*factor}:{b*factor}')
 if mode=='recipe_scale':
  flour,cups=sample(range(2,8),2); batches=randint(2,7)
  q=rf'\text{{A bread recipe uses {flour} cups of flour for every {cups} cups of milk. A larger batch uses {flour*batches} cups of flour. How many cups of milk are needed?}}'
  return make(q,cups*batches,f'The flour amount is {batches} times the original recipe, so multiply the milk amount by {batches} too.','None.','Scale both ingredients by the same factor.',instruction='Solve the recipe problem:',calculation=rf'{cups}\times {batches}={cups*batches}')
 if mode=='compare_rates':
  rate_a=randint(6,15); rate_b=rate_a+randint(2,8)
  minutes_a=randint(2,5); minutes_b=randint(2,5)
  q=rf'\text{{Machine A makes {rate_a*minutes_a} parts in {minutes_a} minutes. Machine B makes {rate_b*minutes_b} parts in {minutes_b} minutes. How many more parts per minute does the faster machine make?}}'
  return make(q,rate_b-rate_a,f'Machine A makes {rate_a} parts each minute, and B makes {rate_b}. Compare their unit rates.',r'\text{Unit rate}=\dfrac{\text{total}}{\text{time}}','First find the number of parts each machine makes in one minute.',instruction='Compare the rates:',calculation=rf'\dfrac{{{rate_b*minutes_b}}}{{{minutes_b}}}-\dfrac{{{rate_a*minutes_a}}}{{{minutes_a}}}={rate_b-rate_a}')
 if mode=='two_stage_rate':
  rate=randint(8,24); hours1=randint(2,5); hours2=randint(2,5); removed=randint(3,rate)
  q=rf'\text{{A water tank receives {rate} litres per hour for {hours1} hours in the morning and {hours2} hours in the afternoon. Then {removed} litres are used. How many litres remain from the daily supply?}}'
  ans=rate*(hours1+hours2)-removed
  return make(q,ans,f'The tank fills for {hours1+hours2} hours altogether. Work out all the water received, then subtract {removed} litres.',r'\text{Remaining}=\text{rate}\times\text{total time}-\text{used}','Combine both filling periods before subtracting the water used.',instruction='Solve the two-stage rate problem:',calculation=rf'{rate}\times({hours1}+{hours2})-{removed}={ans}')
 if mode=='ratio_transfer':
  a,b=sample(range(3,10),2); part=randint(5,14); moved=randint(2,min(a*part-1,12))
  q=rf'\text{{Two classes initially have {a*part} and {b*part} library books, in the ratio {a}:{b}. Class A gives {moved} books to Class B. How many books does Class B now have?}}'
  ans=b*part+moved
  return make(q,ans,f'Class B starts with {b*part} books and receives {moved} more. The transfer does not change the total.',r'\text{New B}=\text{Original B}+\text{transferred}','Work with the actual transfer after identifying B’s original books.',instruction='Find the new number of books:',calculation=rf'{b*part}+{moved}={ans}')
 if mode=='share_difference':
  a,b=sample(range(2,12),2); part=randint(3,16); difference=abs(a-b)*part
  q=rf'\text{{Two friends share a prize in the ratio {a}:{b}. The larger share exceeds the smaller by R{difference}. Find the total prize in rand.}}'
  ans=(a+b)*part
  return make(q,ans,f'The difference between the shares is {abs(a-b)} parts, so each part is R{part}. Both shares total {a+b} parts.',r'\text{Whole}=\dfrac{\text{difference}}{\text{difference in parts}}\times\text{total parts}','The difference in money corresponds to the difference in ratio parts.',instruction='Work backwards from the difference:',calculation=rf'\dfrac{{{difference}}}{{{abs(a-b)}}}\times({a}+{b})={ans}')
 if mode=='combined_journey':
  s1=choice([30,40,50,60,70]); s2=choice([v for v in [40,50,60,70,80] if v!=s1]); h1=randint(2,4); h2=randint(2,4)
  q=rf'\text{{A delivery van travels at {s1} km/h for {h1} hours, then at {s2} km/h for {h2} hours. What total distance does it travel?}}'
  ans=s1*h1+s2*h2
  return make(q,ans,f'Find the distance of each stage separately, then add them.',r'\text{Total distance}=s_1t_1+s_2t_2','Do not multiply the total time by only one of the speeds.',instruction='Calculate the total distance:',calculation=rf'{s1}\times {h1}+{s2}\times {h2}={ans}')
 if mode=='ratio_after_loss':
  a,b=sample(range(3,10),2); part=randint(4,12); lost=randint(2,b*part-1)
  q=rf'\text{{A school stores {a*part} blue balls and {b*part} red balls in the ratio {a}:{b}. After {lost} red balls are lost, how many balls remain altogether?}}'
  ans=(a+b)*part-lost
  return make(q,ans,f'First total the original balls, then subtract the {lost} that were lost.',r'\text{Remaining}=\text{Original total}-\text{lost}','The ratio describes the starting quantities, not the ratio after the loss.',instruction='Find the remaining number:',calculation=rf'{a*part}+{b*part}-{lost}={ans}')
 if mode=='mixture_fraction':
  a,b,c=sample(range(2,10),3); total=a+b+c
  q=rf'\text{{A drink is made from water, juice and syrup in the ratio {a}:{b}:{c}. What fraction of the drink is NOT water? Give the fraction in simplest form.}}'
  ans=Fraction(b+c,total)
  return make(q,ans,f'There are {total} parts altogether. Juice and syrup together account for {b+c} parts.',r'\text{Fraction not water}=\dfrac{\text{juice+syrup parts}}{\text{all parts}}','Combine the non-water parts before making the fraction.',instruction='Find the simplified fraction:',calculation=rf'\dfrac{{{b}+{c}}}{{{total}}}={tex(ans)}')
 raise ValueError(f'Unsupported ratio-and-rate question mode: {mode}')

def build(topic,skill,advanced):
 a,b=randint(2,20),randint(2,15)
 if topic=='Whole Numbers':
  if skill=='Ratio and rate':
   return ratio_rate(advanced)
  if skill=='Introduction':
   # Place value and expanded notation, suitable for the start of the chapter.
   digit=randint(2,8)
   if advanced:
    thousands,hundreds,tens=randint(1,9),randint(1,9),randint(0,9)
    n=thousands*1000+hundreds*100+tens*10+digit
    q=rf'\text{{In the number }}{n}\text{{, find the value of the digit }}{hundreds}\text{{ in the hundreds place.}}'
    return make(q,hundreds*100,'A digit in the hundreds place is worth hundreds times 100.','None.','Multiply the hundreds digit by 100.',instruction='Use place value:')
   h,t=randint(1,9),randint(0,9)
   n=h*100+t*10+digit
   q=rf'{h}\times100+{t}\times10+{digit}'
   return make(q,n,'Use the hundreds, tens and units to build the whole number.',r'100h+10t+u','Add the place-value parts.',instruction='Write the whole number:')
  if skill=='Ordering and comparing whole numbers':
   a,b,c=sample(range(101,1000),3) if not advanced else sample(range(1001,10000),3)
   q=rf'{a};\ {b};\ {c}'
   if advanced:
    return make(q,min(a,b,c),'Compare the highest place-value digits first. The smallest number comes first.','None.','Compare thousands, then hundreds, tens and units.',instruction='Write the smallest whole number:')
   return make(q,max(a,b,c),'Compare the hundreds first, then the tens and units.','None.','Start with the largest place-value position.',instruction='Write the greatest whole number:')
  if skill=='Calculations using whole numbers':
   a,b,c=randint(10,65),randint(2,12),randint(2,9)
   if advanced:
    q=rf'{a}+{b}\times {c}'
    return make(q,a+b*c,'Use BODMAS. Multiply before adding.','None.','Do the multiplication before the addition.')
   q=rf'({a}+{b})\times {c}'
   return make(q,(a+b)*c,'Calculate inside the brackets first, then multiply.','None.','The brackets come first in BODMAS.')
  if skill=='Multiples and factors':
   mode=choice(['HCF','LCM','prime'])
   if mode in ('HCF','LCM'):
    d=randint(2,8); a,b=randint(2,10)*d,randint(2,12)*d
    answer=gcd(a,b) if mode=='HCF' else lcm(a,b)
    q=rf'{a};\ {b}'
    return make(q,answer,f'Find the {"highest common factor" if mode=="HCF" else "lowest common multiple"} of {a} and {b}.','None.','List prime factors or multiples to compare.',instruction=f'Find the {mode}:')
   primes=[2,3,5,7,11,13,17,19]
   n=choice(primes)*choice([2,3,5,7])
   q=rf'{n}'
   return make(q,min(p for p in primes if n%p==0),'A prime factor divides the number exactly and has only two factors.','None.','Test the smallest prime numbers first.',instruction='Find the smallest prime factor:')
  if skill=='Solving problems with whole numbers':
   if advanced:
    groups=randint(3,9); each=randint(12,35); removed=randint(5,groups*each//2)
    q=rf'\text{{A school has {groups} boxes of {each} books. It gives away {removed} books. How many books remain?}}'
    return make(q,groups*each-removed,'Multiply boxes by books per box, then subtract the books given away.','None.','Find the total before subtracting.',instruction='Solve the word problem:')
   groups=randint(3,10); each=randint(12,28)
   q=rf'\text{{There are {groups} boxes with {each} pencils in each box. How many pencils are there?}}'
   return make(q,groups*each,'Multiply the number of boxes by the pencils in each box.','None.','Use multiplication for equal groups.',instruction='Solve the word problem:')
  if skill=='Working with money: Budgets, savings, discount, interest and exchange rates':
   mode=choice(['discount','savings','interest','exchange','budget']) if advanced else choice(['discount','savings','budget'])
   amount=randint(5,25)*40
   if mode=='discount':
    rate=choice([5,10,15,20,25]); discount=Fraction(amount*rate,100)
    q=rf'\text{{An item costs R{amount}. It is discounted by {rate}\%. Find the sale price in rand.}}'
    return make(q,amount-discount,'Convert the percentage to a fraction of 100, calculate the discount, then subtract it.',r'\text{Sale price}=\text{price}-\text{discount}','Find the discount amount before subtracting.',instruction='Solve the money problem:')
   if mode=='savings':
    weeks=randint(3,12); per_week=randint(10,60)
    q=rf'\text{{A learner saves R{per_week} each week for {weeks} weeks. How much is saved?}}'
    return make(q,weeks*per_week,'Multiply the weekly savings by the number of weeks.','None.','Use equal groups to calculate the savings.',instruction='Solve the savings problem:')
   if mode=='interest':
    rate=choice([5,10,15,20]); interest=Fraction(amount*rate,100)
    q=rf'\text{{Find the simple interest on R{amount} at {rate}\% per year for 1 year.}}'
    return make(q,interest,'Calculate the yearly percentage of the original amount.',r'I=\dfrac{P\times r\times t}{100}','Use the original amount and the yearly rate.',instruction='Solve the interest problem:')
   if mode=='exchange':
    rate=choice([15,17,18,20]); dollars=randint(3,18)
    q=rf'\text{{In this question, 1 US dollar = R{rate}. How many rand equal {dollars} US dollars?}}'
    return make(q,rate*dollars,'Multiply the dollars by the rand-per-dollar rate given in the question.','None.','Use the exchange rate stated in the question.',instruction='Solve the exchange-rate problem:')
   cost=randint(8,23)*10; budget=cost+randint(5,20)*10
   q=rf'\text{{A learner has R{budget} and spends R{cost}. How much money is left?}}'
   return make(q,budget-cost,'Subtract the money spent from the original budget.','None.','The remaining amount is the budget minus spending.',instruction='Solve the budget problem:')
  if skill=='Properties of whole numbers':
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
