const fs=require("fs"),path=require("path");
const DATA_PATH=process.env.DATA_PATH||path.join(process.cwd(),"data");fs.mkdirSync(DATA_PATH,{recursive:true});
const f=n=>path.join(DATA_PATH,n);
function r(n,d){try{return JSON.parse(fs.readFileSync(f(n),"utf8"))}catch{return d}}
function w(n,v){const t=f(n+".tmp");fs.writeFileSync(t,JSON.stringify(v,null,2));fs.renameSync(t,f(n))}
function getSubscribers(){return new Set(r("subscribers.json",[]))}
function subscribe(j){const s=getSubscribers();s.add(j);w("subscribers.json",[...s])}
function unsubscribe(j){const s=getSubscribers();s.delete(j);w("subscribers.json",[...s])}
function getState(){return r("state.json",{initialized:false,level:"UNKNOWN",gateStatus:"UNKNOWN",procedureId:null,sentCountdown:[]})}
function saveState(s){w("state.json",s)}
module.exports={DATA_PATH,getSubscribers,subscribe,unsubscribe,getState,saveState};