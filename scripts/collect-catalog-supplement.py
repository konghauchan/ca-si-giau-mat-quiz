"""Supplement the private catalog with public Wikidata CC0 metadata and cached
MusicBrainz recordings. No audio/lyrics; no invented MusicBrainz IDs.
US_UK accepts unknown languages for verified roster artists (user policy).
"""
import argparse
from collections import defaultdict
import hashlib
import importlib.util
import json
from pathlib import Path
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid

ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('artist',ROOT/'scripts/collect-artist-catalog.py')
artist=importlib.util.module_from_spec(spec);spec.loader.exec_module(artist)
NAMESPACE=uuid.UUID('ccaf9aa7-a5bc-54dc-a2ef-122afca7c2cf')
POLICY='verified-artist-unknown-language-v1'
ENGLISH='Q1860'
TYPES={'Q7366','Q134556'}
UA='DoNhacCatalog/1.0 (https://github.com/konghauchan/ca-si-giau-mat-quiz)'

def item(value):
    name=value.rsplit('/',1)[-1]
    if not name.startswith('Q') or not name[1:].isdigit():raise ValueError('Invalid Wikidata item')
    return name

def catalog_id(qid):
    item(qid)
    return str(uuid.uuid5(NAMESPACE,'wikidata:'+qid))

def accepted_languages(languages):
    return not languages or (ENGLISH in languages and 'Q9199' not in languages)

def index_identity(song,by_title,artist_names=None):
    source=song.get('source') or {}
    ids=set(source.get('artistIds',[]))|{v['artistId'] for v in source.get('performerCredits',[])}
    for name in song.get('performers',[])+song.get('artistAliases',[]):
        aid=(artist_names or {}).get(artist.normalized(name))
        if aid:ids.add(aid)
    for aid in ids:by_title[(artist.normalized(song['title']),aid)].add(song['id'])

class Provider:
    def __init__(self,directory):self.directory=directory;self.next_at=0
    def query(self,query):
        file=self.directory/(hashlib.sha256(query.encode()).hexdigest()+'.json')
        if file.exists():return json.loads(file.read_text(encoding='utf8'))
        url='https://query.wikidata.org/sparql?'+urllib.parse.urlencode({'query':query,'format':'json'})
        for attempt in range(6):
            time.sleep(max(0,self.next_at-time.monotonic()));self.next_at=time.monotonic()+2
            try:
                req=urllib.request.Request(url,headers={'User-Agent':UA,'Accept':'application/sparql-results+json'})
                with urllib.request.urlopen(req,timeout=65) as response:data=response.read(32*1024*1024+1)
                if len(data)>32*1024*1024:raise ValueError('Wikidata response too large')
                value=json.loads(data);rows=value['results']['bindings']
                if not isinstance(rows,list):raise ValueError('Invalid Wikidata bindings')
                artist.bulk.atomic_json(file,rows);return rows
            except (urllib.error.URLError,TimeoutError,OSError) as error:
                if isinstance(error,urllib.error.HTTPError) and error.code not in (408,429,500,502,503,504):raise
                if attempt==5:raise
                self.next_at=time.monotonic()+min(120,5*2**attempt)
    def artist_entity(self,aid):
        if not artist.bulk.UUID.fullmatch(aid):raise ValueError('Invalid artist ID')
        file=self.directory/('artist-link-'+aid+'.json')
        if file.exists():value=json.loads(file.read_text(encoding='utf8'))
        else:
            time.sleep(max(0,self.next_at-time.monotonic()));self.next_at=time.monotonic()+2
            url='https://musicbrainz.org/ws/2/artist/'+aid+'?inc=url-rels&fmt=json'
            req=urllib.request.Request(url,headers={'User-Agent':UA,'Accept':'application/json'})
            with urllib.request.urlopen(req,timeout=65) as response:value=json.load(response)
            if value.get('id')!=aid:raise ValueError('Artist link identity mismatch')
            artist.bulk.atomic_json(file,value)
        links=set()
        for relation in value.get('relations',[]):
            url=relation.get('url',{}).get('resource','')
            if relation.get('type')=='wikidata' and urllib.parse.urlparse(url).hostname in ('www.wikidata.org','wikidata.org'):
                links.add(item(url))
        return next(iter(links)) if len(links)==1 else None

def aggregate(rows):
    songs={}
    for row in rows:
        qid=item(row['song']['value']);aid=item(row['artist']['value']);kind=item(row['type']['value'])
        if kind not in TYPES:continue
        value=songs.setdefault(qid,{'id':qid,'title':row['title']['value'],'artists':set(),'languages':set(),'workIds':set()})
        value['artists'].add(aid)
        if 'lang' in row:value['languages'].add(item(row['lang']['value']))
        if 'mbid' in row:
            wid=row['mbid']['value'].lower()
            if artist.bulk.UUID.fullmatch(wid):value['workIds'].add(wid)
    return songs

def convert(value,identities,existing,by_title,review):
    if not accepted_languages(value['languages']):return None
    credits=[identities[qid] for qid in sorted(value['artists']) if qid in identities]
    if not credits:return None
    if len(value['workIds'])>1:
        review.append({'entity':value['id'],'reason':'multiple-work-ids'});return None
    wid=next(iter(value['workIds']),None)
    if wid and wid in existing and existing[wid]['scope']!='US_UK':
        review.append({'entity':value['id'],'reason':'scope-conflict','id':wid});return None
    title=value['title'].strip()
    if not title or len(title)>120 or '\ufffd' in title:return None
    if not wid:
        candidates=set()
        for credit in credits:candidates.update(by_title.get((artist.normalized(title),credit['id']),[]))
        if candidates:
            # A matching title is NOT proof that two sources mean the same work.
            # Keep the existing searchable row and surface candidates for review.
            review.append({'entity':value['id'],'reason':'existing-title-artist-candidate','candidates':sorted(candidates)});return None
    sid=wid or catalog_id(value['id'])
    return {'id':sid,'title':title,'scope':'US_UK','detail':'Tác phẩm âm nhạc',
            'performers':[credits[0]['name']],'artistAliases':list(dict.fromkeys(c['name'] for c in credits)),
            'source':{'provider':'Wikidata','catalogId':sid,'workId':wid,'wikidataId':value['id'],
                      'artistIds':[c['id'] for c in credits],
                      'languageStatus':'confirmed' if value['languages'] else 'unknown',
                      'languageEntities':sorted(value['languages']),
                      'languages':['eng'] if ENGLISH in value['languages'] else [],'scopePolicy':POLICY,
                      'evidence':[{'provider':'Wikidata','id':value['id'],'artistId':c['id'],
                                   'url':'https://www.wikidata.org/wiki/'+value['id']} for c in credits]}}

def collect(args):
    directory=ROOT/args.state_dir;directory.mkdir(parents=True,exist_ok=True)
    provider=Provider(directory/'responses')
    baseline=json.loads((ROOT/args.existing).read_text(encoding='utf8'))
    existing={s['id']:s for s in baseline['songs']};by_title=defaultdict(set)
    roster=json.loads((ROOT/args.roster).read_text(encoding='utf8'))
    cache=json.loads((ROOT/args.identities).read_text(encoding='utf8'));verified={}
    for _,entry in artist.roster_entries(roster):
        name=entry if isinstance(entry,str) else entry['name'];saved=cache.get(name,{})
        if saved.get('resolverVersion')!=artist.RESOLVER_VERSION or not saved.get('artist'):raise ValueError('Unverified artist '+name)
        a=saved['artist'];verified[a['id']]={**a,'name':name}
    artist_names={}
    for aid,value in verified.items():
        for name in (value['name'],value.get('requested',value['name'])):
            key=artist.normalized(name)
            if key in artist_names and artist_names[key]!=aid:raise ValueError('Ambiguous verified artist name')
            artist_names[key]=aid
    for song in baseline['songs']:index_identity(song,by_title,artist_names)
    incoming={};review=[];cached_files=0;cached_recordings=0
    def add(song):
        previous=incoming.get(song['id'])
        if previous:
            source={**previous.get('source',{})};other=song.get('source',{})
            for key in ('evidence','performerCredits'):
                def proof_key(value):
                    if key=='performerCredits':return value['artistId']
                    return (value['provider'],value.get('artistId'),value['id'] if value['provider']=='Wikidata' else '')
                values={proof_key(v):v for v in source.get(key,[])+other.get(key,[])}
                if values:source[key]=list(values.values())
            source['artistIds']=list(dict.fromkeys(source.get('artistIds',[])+other.get('artistIds',[])))
            song={**previous,'artistAliases':list(dict.fromkeys(previous.get('artistAliases',[])+song.get('artistAliases',[]))),'source':source}
        incoming[song['id']]=song
        index_identity(song,by_title)
    for path in (ROOT/args.recording_cache).glob('*.json'):
        value=json.loads(path.read_text(encoding='utf8'))
        if not isinstance(value,dict) or not isinstance(value.get('recordings'),list):continue
        cached_files+=1
        for recording in value['recordings']:
            cached_recordings+=1
            for aid in {c.get('artist',{}).get('id') for c in recording.get('artist-credit',[]) if isinstance(c,dict)}.intersection(verified):
                songs,_=artist.recording_songs(recording,verified[aid],allow_unknown=True)
                for song in songs:
                    if song['id'] not in existing or song['id'] in incoming:add(song)
    print(json.dumps({'cachedFiles':cached_files,'cachedRecordings':cached_recordings,'candidateWorks':len(incoming)}),flush=True)
    mappings=defaultdict(set);ids=sorted(verified)
    for start in range(0,len(ids),40):
        literals=' '.join(json.dumps(v) for v in ids[start:start+40])
        query='SELECT ?artist ?mbid WHERE { VALUES ?mbid { '+literals+' } ?artist wdt:P434 ?mbid. }'
        for row in provider.query(query):mappings[row['mbid']['value']].add(item(row['artist']['value']))
    identities={};unresolved=[]
    for aid in ids:
        if not mappings[aid]:
            linked=provider.artist_entity(aid)
            if linked:mappings[aid].add(linked)
        if len(mappings[aid])!=1:unresolved.append({'artist':verified[aid]['name'],'matches':sorted(mappings[aid])});continue
        identities[next(iter(mappings[aid]))]=verified[aid]
    all_values={};qids=sorted(identities)
    for start in range(0,len(qids),10):
        values=' '.join('wd:'+v for v in qids[start:start+10]);offset=0
        while True:
            query='''SELECT ?song ?title ?artist ?type ?lang ?mbid WHERE {
VALUES ?artist { '''+values+''' } VALUES ?type { wd:Q7366 wd:Q134556 }
?song wdt:P175 ?artist; wdt:P31 ?type; rdfs:label ?title. FILTER(LANG(?title)="en")
OPTIONAL { ?song (wdt:P407|wdt:P364) ?lang }
OPTIONAL { ?song wdt:P435 ?mbid }
} ORDER BY ?song ?artist ?type ?lang ?mbid LIMIT 5000 OFFSET '''+str(offset)
            rows=provider.query(query)
            for qid,value in aggregate(rows).items():
                if qid not in all_values:all_values[qid]=value
                else:
                    for key in ('artists','languages','workIds'):all_values[qid][key].update(value[key])
            if len(rows)<5000:break
            offset+=5000
        print(json.dumps({'wikidataArtistsProcessed':min(start+10,len(qids)),'mappedArtists':len(qids),'items':len(all_values)}),flush=True)
    excluded=0
    # Known Work IDs are indexed before unlinked items, including works just
    # recovered from the recording cache. Never duplicate a newly recovered hit.
    for value in sorted(all_values.values(),key=lambda value:not bool(value['workIds'])):
        if not accepted_languages(value['languages']):excluded+=1;continue
        song=convert(value,identities,existing,by_title,review)
        if song:add(song)
    songs=sorted(incoming.values(),key=lambda s:s['id'])
    result={'source':{'provider':'MusicBrainz + Wikidata','license':'CC0-1.0','complete':True,
                     'scopePolicy':POLICY,'retrievedAt':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),
                     'rosterArtists':len(verified),'wikidataArtistsMapped':len(identities),'wikidataUnresolvedArtists':unresolved,
                     'wikidataItems':len(all_values),'wikidataForeignItemsExcluded':excluded,
                     'cachedRecordingPages':cached_files,'cachedRecordingsProcessed':cached_recordings,
                     'coverage':'All Wikidata song/single pages for mapped artists; cached MusicBrainz pages only, not a fresh full recording crawl.',
                     'count':len(songs)},'songs':songs}
    artist.bulk.atomic_json(ROOT/args.output,result)
    artist.bulk.atomic_json(directory/'review.json',{'items':review})
    print(json.dumps(result['source']),flush=True)

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--existing',default='data/artist-catalog/cloud-merged.json')
    parser.add_argument('--roster',default='scripts/artist-catalog-roster.json')
    parser.add_argument('--identities',default='data/artist-catalog/identities.json')
    parser.add_argument('--recording-cache',default='data/artist-catalog/responses')
    parser.add_argument('--state-dir',default='data/catalog-supplement')
    parser.add_argument('--output',default='data/catalog-supplement/expansion.json')
    collect(parser.parse_args())
