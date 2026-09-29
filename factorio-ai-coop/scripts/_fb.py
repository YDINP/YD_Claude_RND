import sys;sys.path.insert(0,'bridge');sys.path.insert(0,'scripts')
import runsite
from client import AIBridge
from orders import submit
import p1
who, n = sys.argv[1], int(sys.argv[2])
ai=AIBridge(); h=p1.hub(ai); x,y,c=h['iron-plate']; print(h['iron-plate'], ai.agent(who).items().get('iron-plate'))
plan=[('walk_to',{'x':x,'y':y+1.5}),('take',{'name':'iron-plate','x':x,'y':y,'count':3*n+4}),('craft',{'recipe':'fast-transport-belt','count':n,'wait':'block'}),('walk_to',{'x':59.5,'y':-13}),('insert',{'name':'fast-transport-belt','x':59.5,'y':-14.5,'count':n}),('walk_to',{'x':66.5,'y':-20.5})]
print(submit(ai,who,plan,strict=False))
