from pathlib import Path
import json
import pycountry

print(pycountry.countries.get(alpha_2='BG'))
def country_name(cid, lang='en'):
    try:
        c = pycountry.countries.get(alpha_2=cid.upper())
        if not c:
            return cid.upper()
        if lang == 'fr':
            try:
                from babel import Locale
                return Locale('fr').territories.get(cid.upper(), c.name)
            except Exception:
                return c.name
        return c.name
    except Exception:
        return cid.upper()

def export_network_data(locality_df, foreign_network, output_path):
    output_path = Path(output_path); output_path.parent.mkdir(parents=True, exist_ok=True)
    c = (locality_df.groupby('country').agg(local_share=('local_share','mean'),foreign_share=('foreign_share','mean'),unknown_share=('unknown_share','mean'),n_weeks=('date','size')))
    ex = foreign_network.groupby('source')['mean_share'].sum().rename('export_intensity')
    im = foreign_network.groupby('destination')['mean_share'].sum().rename('import_intensity')
    c = c.join(ex,how='left').join(im,how='left').fillna(0)
    c['net_dominance'] = ((c.export_intensity-c.import_intensity)/(c.export_intensity+c.import_intensity).replace(0,float('nan'))).fillna(0)
    c['network_involvement'] = c.export_intensity+c.import_intensity
    ids = {str(x).lower() for x in c.index}
    e = foreign_network.copy(); e['source']=e.source.astype(str).str.lower(); e['destination']=e.destination.astype(str).str.lower()
    e = e[(e.source!=e.destination)&e.source.isin(ids)&e.destination.isin(ids)]

    countries=[]
    for k,r in c.iterrows():
        cid=str(k).lower()
        countries.append({
            'id':cid,
            'name':country_name(cid),
            'name_fr':country_name(cid,lang='fr'),
            'local_share':float(r.local_share),
            'foreign_share':float(r.foreign_share),
            'unknown_share':float(r.unknown_share),
            'export_intensity':float(r.export_intensity),
            'import_intensity':float(r.import_intensity),
            'net_dominance':float(r.net_dominance),
            'network_involvement':float(r.network_involvement),
            'n_weeks':int(r.n_weeks)
        })
    edges=[{'source':str(r.source),'target':str(r.destination),'weight':float(r.mean_share),'n_weeks':int(r.n_weeks)} for _,r in e.iterrows()]
    output_path.write_text(json.dumps({'metadata':{'title':'Global Music Dominance','n_countries':len(countries),'n_edges':len(edges)},'countries':countries,'edges':edges},indent=2),encoding='utf-8')
    print(f'Exported {len(countries)} countries and {len(edges)} relationships to {output_path}')
