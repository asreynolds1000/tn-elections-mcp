/**
 * Tennessee county data: 95 county codes, 14 EasyVote campaign finance configs,
 * and resolution helpers.
 *
 * EasyVote tenant IDs verified via live API scan (2026-03-25).
 * See ~/Projects/_scratch/tn-easyvote-county-scan.md for details.
 */

export interface EasyVoteCountyConfig {
  slug: string
  name: string
  tenantId: string
  filerCount: number  // snapshot from scan date; may change
  countySeat: string
}

// 14 counties with active EasyVote Campaign Finance portals
export const EASYVOTE_COUNTIES: EasyVoteCountyConfig[] = [
  { slug: 'andersoncountytn', name: 'Anderson', tenantId: 'F3FFF032-32E1-46E6-9FE7-D27E29ED5190', filerCount: 0, countySeat: 'Clinton' },
  { slug: 'davidsoncountytn', name: 'Davidson', tenantId: '1A0C899A-456B-4913-BFF0-4A8B0AE932A1', filerCount: 349, countySeat: 'Nashville' },
  { slug: 'greenecountytn', name: 'Greene', tenantId: 'B703BCE6-0E9C-4C19-B17C-0D6969D1E507', filerCount: 18, countySeat: 'Greeneville' },
  { slug: 'hamblencountytn', name: 'Hamblen', tenantId: 'B4520609-C0BC-43FE-ADC4-04C6C1E02872', filerCount: 54, countySeat: 'Morristown' },
  { slug: 'hamiltoncountytn', name: 'Hamilton', tenantId: '0F5A08EE-617A-4B11-AD30-E963AE98E120', filerCount: 344, countySeat: 'Chattanooga' },
  { slug: 'knoxcountytn', name: 'Knox', tenantId: '4BB07902-FDCA-4D3B-BF6F-EA8F3A3E99A4', filerCount: 147, countySeat: 'Knoxville' },
  { slug: 'madisoncountytn', name: 'Madison', tenantId: 'B97BABE0-EB4E-498E-9C15-A2274E75B1FF', filerCount: 0, countySeat: 'Jackson' },
  { slug: 'marioncountytn', name: 'Marion', tenantId: '64B80BAC-CC7E-4287-986F-E7200BA3C357', filerCount: 0, countySeat: 'Jasper' },
  { slug: 'maurycountytn', name: 'Maury', tenantId: 'B5C91383-E324-410A-812E-826D6F5AF93F', filerCount: 89, countySeat: 'Columbia' },
  { slug: 'rutherfordcountytn', name: 'Rutherford', tenantId: '09ECD306-F24C-4CDD-9580-F9815F736BD5', filerCount: 205, countySeat: 'Murfreesboro' },
  { slug: 'shelbycountytn', name: 'Shelby', tenantId: 'EE6EBC62-7B7C-432F-869E-4DE111271E07', filerCount: 496, countySeat: 'Memphis' },
  { slug: 'sullivancountytn', name: 'Sullivan', tenantId: '6074E035-D00A-404F-8A84-6ED696F1378D', filerCount: 347, countySeat: 'Blountville' },
  { slug: 'washingtoncountytn', name: 'Washington', tenantId: '683CABF8-1501-48E7-A4DE-A68A9DF9E44F', filerCount: 114, countySeat: 'Jonesborough' },
  { slug: 'williamsoncountytn', name: 'Williamson', tenantId: '38C18856-1015-498C-9A35-D162A05FA0DF', filerCount: 215, countySeat: 'Franklin' },
]

// Reverse lookups for resolveCounty()
const BY_NAME = new Map(EASYVOTE_COUNTIES.map(c => [c.name.toLowerCase(), c]))
const BY_SLUG = new Map(EASYVOTE_COUNTIES.map(c => [c.slug, c]))
const BY_SEAT = new Map(EASYVOTE_COUNTIES.map(c => [c.countySeat.toLowerCase(), c]))

/**
 * Resolve a county input to an EasyVote config.
 * Accepts: county name ("Knox"), slug ("knoxcountytn"), county seat ("Knoxville"),
 * or partial match ("david" → Davidson).
 */
export function resolveCounty(input: string): EasyVoteCountyConfig | null {
  const lower = input.toLowerCase().trim()
  if (!lower) return null

  // Exact match by name
  const byName = BY_NAME.get(lower)
  if (byName) return byName

  // Exact match by slug
  const bySlug = BY_SLUG.get(lower)
  if (bySlug) return bySlug

  // Exact match by county seat
  const bySeat = BY_SEAT.get(lower)
  if (bySeat) return bySeat

  // Partial match on name (prefix)
  for (const county of EASYVOTE_COUNTIES) {
    if (county.name.toLowerCase().startsWith(lower)) return county
  }

  // Partial match on county seat
  for (const county of EASYVOTE_COUNTIES) {
    if (county.countySeat.toLowerCase().startsWith(lower)) return county
  }

  return null
}

// All 95 Tennessee counties with FIPS codes (for Phase 3 disclosures)
export const TN_COUNTIES: Record<string, string> = {
  '001': 'Anderson',
  '003': 'Bedford',
  '005': 'Benton',
  '007': 'Bledsoe',
  '009': 'Blount',
  '011': 'Bradley',
  '013': 'Campbell',
  '015': 'Cannon',
  '017': 'Carroll',
  '019': 'Carter',
  '021': 'Cheatham',
  '023': 'Chester',
  '025': 'Claiborne',
  '027': 'Clay',
  '029': 'Cocke',
  '031': 'Coffee',
  '033': 'Crockett',
  '035': 'Cumberland',
  '037': 'Davidson',
  '039': 'Decatur',
  '041': 'DeKalb',
  '043': 'Dickson',
  '045': 'Dyer',
  '047': 'Fayette',
  '049': 'Fentress',
  '051': 'Franklin',
  '053': 'Gibson',
  '055': 'Giles',
  '057': 'Grainger',
  '059': 'Greene',
  '061': 'Grundy',
  '063': 'Hamblen',
  '065': 'Hamilton',
  '067': 'Hancock',
  '069': 'Hardeman',
  '071': 'Hardin',
  '073': 'Hawkins',
  '075': 'Haywood',
  '077': 'Henderson',
  '079': 'Henry',
  '081': 'Hickman',
  '083': 'Houston',
  '085': 'Humphreys',
  '087': 'Jackson',
  '089': 'Jefferson',
  '091': 'Johnson',
  '093': 'Knox',
  '095': 'Lake',
  '097': 'Lauderdale',
  '099': 'Lawrence',
  '101': 'Lewis',
  '103': 'Lincoln',
  '105': 'Loudon',
  '107': 'Macon',
  '109': 'Madison',
  '111': 'Marion',
  '113': 'Marshall',
  '115': 'Maury',
  '117': 'McMinn',
  '119': 'McNairy',
  '121': 'Meigs',
  '123': 'Monroe',
  '125': 'Montgomery',
  '127': 'Moore',
  '129': 'Morgan',
  '131': 'Obion',
  '133': 'Overton',
  '135': 'Perry',
  '137': 'Pickett',
  '139': 'Polk',
  '141': 'Putnam',
  '143': 'Rhea',
  '145': 'Roane',
  '147': 'Robertson',
  '149': 'Rutherford',
  '151': 'Scott',
  '153': 'Sequatchie',
  '155': 'Sevier',
  '157': 'Shelby',
  '159': 'Smith',
  '161': 'Stewart',
  '163': 'Sullivan',
  '165': 'Sumner',
  '167': 'Tipton',
  '169': 'Trousdale',
  '171': 'Unicoi',
  '173': 'Union',
  '175': 'Van Buren',
  '177': 'Warren',
  '179': 'Washington',
  '181': 'Wayne',
  '183': 'Weakley',
  '185': 'White',
  '187': 'Williamson',
  '189': 'Wilson',
}

// Reverse lookup: lowercase name → FIPS code
export const TN_COUNTY_NAMES = new Map(
  Object.entries(TN_COUNTIES).map(([code, name]) => [name.toLowerCase(), code]),
)
