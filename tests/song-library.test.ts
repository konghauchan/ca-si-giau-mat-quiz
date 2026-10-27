import test from 'node:test';
import assert from 'node:assert/strict';
import {createClient,type Client} from '@libsql/client';
import {prepareLibrary,importLibrary,verifyLibrary,readLibraryScope,LIBRARY_SCHEMA,type LibrarySong} from '../src/lib/songLibraryStore.ts';

const song=(n:number,scope:'VI'|'US_UK'='US_UK'):LibrarySong=>({id:`00000000-0000-0000-0000-${String(n).padStart(12,'0')}`,title:'Song '+n,scope,detail:'Test',performers:['Artist '+n]});
test('durable library imports, preserves curated labels/source and is idempotent',async()=>{
  const client=createClient({url:':memory:'});
  try{
    await client.execute('CREATE TABLE questions (title TEXT)');await client.execute("INSERT INTO questions VALUES('Private answer')");
    const prepared=prepareLibrary({songs:[{...song(1),source:{workId:song(1).id}},song(2,'VI')]},{songs:[{...song(1),title:'Curated',artistAliases:['Alias']}]});
    assert.equal((await importLibrary(client,prepared,{batchSize:1})).active,true);
    const rows=await readLibraryScope(client,prepared.version,'US_UK');
    assert.equal(rows[0].title,'Curated');assert.deepEqual(rows[0].source,{workId:song(1).id});
    assert.equal((await importLibrary(client,prepared)).alreadyImported,true);
    assert.equal((await client.execute('SELECT COUNT(*) AS n FROM song_library_entries')).rows[0].n,2);
    assert.equal((await client.execute('SELECT title FROM questions')).rows[0].title,'Private answer');
    await client.execute('CREATE TABLE music_catalog(updated_at INTEGER)');
    await client.execute('DELETE FROM music_catalog WHERE updated_at<9999999999999');
    assert.equal((await verifyLibrary(client,prepared)).total,2);
  }finally{client.close();}
});
test('interrupted import keeps previous release active; rerun finishes without duplicates',async()=>{
  const client=createClient({url:':memory:'});
  try{
    const old=prepareLibrary({songs:[song(1)]});await importLibrary(client,old);
    const next=prepareLibrary({songs:[song(2),song(3),song(4,'VI')]});let batches=0;
    const interrupted={executeMultiple:client.executeMultiple.bind(client),execute:client.execute.bind(client),batch:async(...args:Parameters<Client['batch']>)=>{if(++batches===3)throw new Error('Interrupted');return client.batch(...args);}} as Client;
    await assert.rejects(importLibrary(interrupted,next,{batchSize:1}),/Interrupted/);
    assert.equal((await client.execute('SELECT version FROM song_library_active')).rows[0].version,old.version);
    assert.equal((await importLibrary(client,next,{batchSize:1})).total,3);
    assert.equal((await importLibrary(client,old)).active,false);
    assert.equal((await client.execute('SELECT version FROM song_library_active')).rows[0].version,next.version);
  }finally{client.close();}
});
test('verification rejects corrupt or incomplete database content',async()=>{
  const client=createClient({url:':memory:'});
  try{
    const prepared=prepareLibrary({songs:[song(1)]});await client.executeMultiple(LIBRARY_SCHEMA);
    await assert.rejects(verifyLibrary(client,prepared),/checksum/);
    await importLibrary(client,prepared);
    await client.execute("UPDATE song_library_entries SET payload=replace(payload,'Song 1','Corrupt')");
    await assert.rejects(importLibrary(client,prepared),/checksum/);
  }finally{client.close();}
});
test('rejects malformed and duplicate IDs before connecting to a database',()=>{
  assert.throws(()=>prepareLibrary({songs:[song(1),song(1)]}),/Trùng/);
  assert.throws(()=>prepareLibrary({songs:[{...song(1),id:'bad'}]}),/không hợp lệ/);
  assert.throws(()=>prepareLibrary({songs:[]}),/rỗng/);
});
