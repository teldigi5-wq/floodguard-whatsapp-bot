'use strict';
const path=require('node:path');
const dotenv=require('dotenv');
dotenv.config({path:path.resolve(__dirname,'../.env'),quiet:true});
const {createDemoApp}=require('../src/demoServer');
const {validToken}=require('../src/adminAccess');
if (!validToken(process.env.FLOODGUARD_SETUP_TOKEN)) {
  process.stderr.write('Run the private Windows setup helper before starting the offline demo.\n');
  process.exit(1);
}
const port=Number(process.env.DEMO_PORT||8085);
if(!Number.isInteger(port)||port<1||port>65535) {
  process.stderr.write('DEMO_PORT must be in the range 1-65535.\n');
  process.exit(1);
}
// No user-controlled bind address: the preview must remain local-only.
const app=createDemoApp({token:process.env.FLOODGUARD_SETUP_TOKEN,port,host:'127.0.0.1'});
app.listen(port,'127.0.0.1',()=>{
  process.stdout.write('Offline preview ready at http://127.0.0.1:'+port+'\n');
  process.stdout.write('No WhatsApp pairing, Firebase request, device command or alert delivery is enabled.\n');
});
