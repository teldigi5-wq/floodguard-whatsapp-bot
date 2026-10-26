'use strict';
const path=require('node:path');
const fs=require('node:fs');
const dotenv=require('dotenv');
const { inspectConfig,formatReport }=require('../src/preflight');
const cwd=path.resolve(__dirname,'..');
const configPath=path.join(cwd,'.env');
// Process-environment values take priority. Never print dotenv or token fields.
if(fs.existsSync(configPath))dotenv.config({path:configPath,quiet:true});
const report=inspectConfig(process.env,{cwd});
process.stdout.write(formatReport(report)+'\n');
if(!report.ok)process.exitCode=1;
