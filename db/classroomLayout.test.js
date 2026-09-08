import test from 'node:test';
import assert from 'node:assert/strict';
import { classroomSlug,clampDeskToCanvas,findOpenDeskPosition,nextDeskCode,validateClassroomLayout } from '../lib/classroomLayout.js';

test('classroomSlug normalizes Latvian room names',()=>{
  assert.equal(classroomSlug('  Programmēšanas klase 204  '),'programmesanas-klase-204');
});

test('nextDeskCode fills the first available D number',()=>{
  assert.equal(nextDeskCode([{code:'D1'},{code:'D3'},{code:'Teacher'}]),'D2');
});

test('clampDeskToCanvas keeps the complete desk visible',()=>{
  assert.deepEqual(clampDeskToCanvas({id:'a',x:980,y:580,width:120,height:80},{width:1000,height:600}),{id:'a',x:880,y:520,width:120,height:80});
});

test('findOpenDeskPosition avoids occupied desks',()=>{
  const position=findOpenDeskPosition([{x:20,y:60,width:120,height:80}],{width:500,height:300});
  assert.deepEqual(position,{x:160,y:60});
});

test('validateClassroomLayout rejects duplicate codes and out of bounds desks',()=>{
  const result=validateClassroomLayout({canvasWidth:400,canvasHeight:300,desks:[
    {id:'one',code:'D1',label:'',x:0,y:0,width:120,height:80},
    {id:'two',code:'d1',label:'',x:350,y:260,width:120,height:80}
  ]});
  assert.equal(result.ok,false);
  assert.match(result.errors.join(' '),/duplicated/);
  assert.match(result.errors.join(' '),/outside/);
});
