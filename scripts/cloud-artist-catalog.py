"""Collect public metadata on a standard GitHub runner, with resumable Git snapshots.
Never receives or uses Turso credentials. Commits only the catalog-result allowlist.
"""
import argparse
import base64
import gzip
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import time
import urllib.error
import urllib.parse
import urllib.request

ROOT=Path(__file__).resolve().parents[1]
REPO='konghauchan/ca-si-giau-mat-quiz'
BRANCH='catalog/complete-377'
STATE=ROOT/'data/catalog-cloud'
PREFIX='catalog-result/'
MAX_BYTES=64*1024*1024
spec=importlib.util.spec_from_file_location('artist_collector',ROOT/'scripts/collect-artist-catalog.py')
collector=importlib.util.module_from_spec(spec);spec.loader.exec_module(collector)


def encode(value):
    return gzip.compress(json.dumps(value,ensure_ascii=False,separators=(',',':')).encode(),mtime=0)


def decode(data,expected_hash):
    if len(data)>MAX_BYTES or hashlib.sha256(data).hexdigest()!=expected_hash:raise ValueError('Catalog snapshot checksum/size mismatch')
    value=gzip.decompress(data)
    if len(value)>256*1024*1024:raise ValueError('Catalog snapshot is too large')
    return json.loads(value)


def api(endpoint,method='GET',value=None,raw=False):
    token=os.environ.get('GITHUB_TOKEN')
    if not token:raise ValueError('Missing GitHub job token')
    headers={'User-Agent':'DoNhacCatalog/1.0','Accept':'application/vnd.github.raw+json' if raw else 'application/vnd.github+json','Authorization':'Bearer '+token,'X-GitHub-Api-Version':'2022-11-28'}
    req=urllib.request.Request('https://api.github.com/repos/'+REPO+'/'+endpoint,data=json.dumps(value).encode() if value is not None else None,headers=headers,method=method)
    for attempt in range(6):
        try:
            with urllib.request.urlopen(req,timeout=60) as response:data=response.read(MAX_BYTES+1)
            if len(data)>MAX_BYTES:raise ValueError('GitHub response exceeds size bound')
            return data if raw else json.loads(data)
        except urllib.error.HTTPError as error:
            if error.code not in (429,500,502,503,504) or attempt==5:raise
            time.sleep(min(60,2**attempt*3))


def remote_file(name):
    return api('contents/'+PREFIX+name+'?ref='+urllib.parse.quote(BRANCH,safe=''),raw=True)


def roster():
    return json.loads((ROOT/'scripts/artist-catalog-roster.json').read_text(encoding='utf8'))


def assemble(checkpoint,roster_value):
    names={entry if isinstance(entry,str) else entry['name'] for _,entry in collector.roster_entries(roster_value)}
    reports={name:report for name,report in checkpoint['artists'].items() if name in names and report.get('complete')}
    for name,report in reports.items():
        if report.get('offset',-1)<report.get('recordingsTotal',0) or report.get('recordingsScanned',-1)<report.get('recordingsTotal',0):raise ValueError('Incomplete recording pages for '+name)
    ids={wid for report in reports.values() for wid in report.get('works',[])}
    songs=[song for wid,song in checkpoint['songs'].items() if wid in ids]
    if len(songs)!=len(ids):raise ValueError('Checkpoint references missing works')
    for song in songs:
        source=song.get('source',{})
        if song.get('scope')!='US_UK' or source.get('workId')!=song.get('id') or not collector.bulk.UUID.fullmatch(song.get('id','')) or 'eng' not in source.get('languages',[]) or 'vie' in source.get('languages',[]) or not collector.bulk.usable_credit(song.get('performers',[])):raise ValueError('Invalid public song metadata')
    complete=len(reports)==len(names)
    source={'provider':'MusicBrainz','url':'https://musicbrainz.org/','license':'CC0-1.0','complete':True,'artistsRequested':len(reports),'fullRosterTarget':len(names),'fullRosterComplete':complete,'remainingArtists':len(names)-len(reports),'rosterUpdatedAt':roster_value.get('_meta',{}).get('updatedAt'),'artistReports':reports,'count':len(songs),'selection':'Completed artist catalogs only; work IDs, English lyric language and recording artist credits validated by collector.'}
    return {'source':source,'songs':songs}


def bootstrap():
    STATE.mkdir(parents=True,exist_ok=True)
    try:
        report=json.loads(remote_file('report.json'))
        for name in ('checkpoint','identities'):
            value=decode(remote_file(name+'.json.gz'),report['files'][name]['sha256'])
            collector.bulk.atomic_json(STATE/(name+'.json'),value)
        return report
    except urllib.error.HTTPError as error:
        if error.code!=404:raise
    manifest=json.loads((ROOT/'catalog-seed/manifest.json').read_text(encoding='utf8'))
    for name in ('checkpoint','identities'):
        value=decode((ROOT/('catalog-seed/'+name+'.json.gz')).read_bytes(),manifest['files'][name]['sha256'])
        collector.bulk.atomic_json(STATE/(name+'.json'),value)
    return {'completedArtists':0,'fullComplete':False}


def publish(status='collecting'):
    checkpoint=json.loads((STATE/'checkpoint.json').read_text(encoding='utf8'))
    identities=json.loads((STATE/'identities.json').read_text(encoding='utf8'))
    songs=assemble(checkpoint,roster())
    payloads={'checkpoint':encode(checkpoint),'identities':encode(identities),'songs':encode(songs)}
    if any(len(data)>45*1024*1024 for data in payloads.values()):raise ValueError('Snapshot exceeds Git blob size budget')
    report={'state':'complete' if songs['source']['fullRosterComplete'] else status,'fullComplete':songs['source']['fullRosterComplete'],'completedArtists':songs['source']['artistsRequested'],'targetArtists':songs['source']['fullRosterTarget'],'collectedWorks':len(checkpoint['songs']),'eligiblePublishedWorks':len(songs['songs']),'recordingsScanned':sum(report.get('recordingsScanned',0) for report in checkpoint['artists'].values()),'updatedAt':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),'runId':os.environ.get('GITHUB_RUN_ID'),'files':{name:{'sha256':hashlib.sha256(data).hexdigest(),'bytes':len(data)} for name,data in payloads.items()}}
    for attempt in range(3):
        ref=api('git/ref/heads/'+BRANCH)
        parent=ref['object']['sha'];tree=api('git/commits/'+parent)['tree']['sha']
        entries=[]
        for name,data in payloads.items():
            blob=api('git/blobs','POST',{'content':base64.b64encode(data).decode(),'encoding':'base64'})
            entries.append({'path':PREFIX+name+'.json.gz','mode':'100644','type':'blob','sha':blob['sha']})
        entries.append({'path':PREFIX+'report.json','mode':'100644','type':'blob','content':json.dumps(report,ensure_ascii=False,indent=2)})
        next_tree=api('git/trees','POST',{'base_tree':tree,'tree':entries})['sha']
        commit=api('git/commits','POST',{'message':f"Catalog checkpoint: {report['completedArtists']}/{report['targetArtists']} artists",'tree':next_tree,'parents':[parent]})['sha']
        try:
            api('git/refs/heads/'+BRANCH,'PATCH',{'sha':commit,'force':False})
            print(json.dumps({'published':report['completedArtists'],'target':report['targetArtists'],'complete':report['fullComplete'],'commit':commit}),flush=True)
            return report
        except urllib.error.HTTPError as error:
            if error.code not in (409,422) or attempt==2:raise


def run(seconds):
    if os.environ.get('GITHUB_REPOSITORY')!=REPO or os.environ.get('GITHUB_REF_NAME')!=BRANCH:raise ValueError('Unexpected repository or branch')
    previous=bootstrap()
    if previous.get('fullComplete'):
        print('All artist catalogs are already complete.',flush=True);return
    last=previous.get('completedArtists',0)
    deadline=time.monotonic()+seconds
    environment={key:value for key,value in os.environ.items() if key not in ('GITHUB_TOKEN','GH_TOKEN','ACTIONS_RUNTIME_TOKEN','ACTIONS_ID_TOKEN_REQUEST_TOKEN')}
    child=None
    try:
        while time.monotonic()<deadline:
            child=subprocess.Popen(['python3','-u','scripts/collect-artist-catalog.py','--state-dir','data/catalog-cloud','--output','data/catalog-cloud/expansion.json','--workers','2','--delay','2'],cwd=ROOT,env=environment)
            while child.poll() is None and time.monotonic()<deadline:
                time.sleep(30)
                try:checkpoint=json.loads((STATE/'checkpoint.json').read_text(encoding='utf8'))
                except FileNotFoundError:continue
                done=assemble(checkpoint,roster())['source']['artistsRequested']
                if done>=last+40:
                    last=publish()['completedArtists']
            if child.poll() is None:
                child.terminate()
                try:child.wait(timeout=30)
                except subprocess.TimeoutExpired:child.kill();child.wait()
            report=publish('checkpoint')
            if report['fullComplete']:return
            if child.returncode==0:raise ValueError('Collector exited successfully with incomplete coverage')
            if time.monotonic()<deadline:time.sleep(60)
    finally:
        if child and child.poll() is None:
            child.terminate()
            try:child.wait(timeout=30)
            except subprocess.TimeoutExpired:child.kill();child.wait()
    publish('checkpoint')


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--seconds',type=int,default=14400)
    parser.add_argument('--verify-remote',action='store_true')
    args=parser.parse_args()
    if args.verify_remote:
        report=json.loads(remote_file('report.json'))
        songs=decode(remote_file('songs.json.gz'),report['files']['songs']['sha256'])
        if not report['fullComplete'] or not songs['source']['fullRosterComplete'] or report['completedArtists']!=377:raise SystemExit('Incomplete artist coverage')
        print(json.dumps({'complete':True,'artists':377,'works':len(songs['songs'])}),flush=True)
    else:run(args.seconds)
