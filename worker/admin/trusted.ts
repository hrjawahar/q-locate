// Where the AI should look first when it searches the web, and sites it should skip.
// Official and government sources first; Wikipedia is only a starting point.

export const NATIONAL = [
  'incredibleindia.gov.in (Incredible India, Ministry of Tourism)',
  'tourism.gov.in (Ministry of Tourism)',
  'asi.nic.in (Archaeological Survey of India: monuments, timings, entry fees)',
  'the district\'s official website, <district>.nic.in: tourist places are at <district>.nic.in/tourist-place/<place-name>/ (address, how to reach, timings). Search "site:<district>.nic.in <place name>", or "site:nic.in <place name> tourist place" if the district site has a different name',
]

// State tourism boards (India). Unknown states fall back to "the state's official tourism site".
const STATE: Record<string, string[]> = {
  'andaman and nicobar islands': ['andamannicobar.gov.in', 'southandaman.nic.in/tourism'],
  'andhra pradesh': ['tourism.ap.gov.in', 'tirumala.org (TTD temples)'],
  'telangana': ['tourism.telangana.gov.in'],
  'tamil nadu': ['tamilnadutourism.tn.gov.in', 'hrce.tn.gov.in (temple department: timings, poojas, contacts)'],
  'kerala': ['keralatourism.org', 'travancoredevaswomboard.org (Travancore Devaswom temples)', 'sabarimala.kerala.gov.in'],
  'karnataka': ['karnatakatourism.org', 'itms.kar.nic.in (Muzrai temples)'],
  'goa': ['goa-tourism.com'],
  'maharashtra': ['maharashtratourism.gov.in'],
  'gujarat': ['gujarattourism.com', 'somnath.org'],
  'rajasthan': ['tourism.rajasthan.gov.in'],
  'madhya pradesh': ['mptourism.com'],
  'uttar pradesh': ['uptourism.gov.in', 'shrikashivishwanath.org'],
  'uttarakhand': ['uttarakhandtourism.gov.in', 'badrinath-kedarnath.gov.in'],
  'himachal pradesh': ['himachaltourism.gov.in'],
  'jammu and kashmir': ['jktourism.jk.gov.in', 'maavaishnodevi.org'],
  'ladakh': ['ladakh.gov.in'],
  'punjab': ['punjabtourism.gov.in', 'sgpc.net (gurdwaras)'],
  'odisha': ['odishatourism.gov.in', 'shreejagannatha.in'],
  'west bengal': ['wbtourism.gov.in'],
  'sikkim': ['sikkimtourism.gov.in'],
  'meghalaya': ['meghalayatourism.in'],
  'assam': ['tourism.assam.gov.in'],
  'bihar': ['tourism.bihar.gov.in'],
  'jharkhand': ['tourism.jharkhand.gov.in'],
  'chhattisgarh': ['chhattisgarhtourism.co.in'],
  'puducherry': ['pondytourism.in'],
  'delhi': ['delhitourism.gov.in'],
}

// Marketing, booking and forum sites: often out of date or unverifiable.
export const BLOCKED = [
  'quora.com', 'reddit.com', 'pinterest.com', 'facebook.com', 'instagram.com', 'youtube.com',
  'booking.com', 'agoda.com', 'makemytrip.com', 'goibibo.com', 'yatra.com', 'cleartrip.com', 'oyorooms.com', 'trivago.in', 'expedia.co.in',
]

export function sourceHints(state?: string | null, district?: string | null, country?: string | null): string {
  if (country && country !== 'India') return 'Look first at the country\'s official tourism board, the site\'s own official website, and government heritage or park authorities.'
  const s = STATE[(state ?? '').toLowerCase().replace(/&/g, 'and').replace(/\s+/g, ' ').trim()] ?? []
  const d = district ? district.toLowerCase().replace(/ district$/, '').replace(/[^a-z]+/g, '') : ''
  return [
    'Look first at these official sources (search with site: when useful):',
    ...NATIONAL.map((x) => `- ${d ? x.replaceAll('<district>', d) : x}`),
    ...(s.length ? s.map((x) => `- ${x}`) : [`- the official tourism site of ${state || 'the state'}`]),
    '- the temple trust\'s or place\'s own official website, and the forest department for parks and sanctuaries',
    'Then Wikipedia and established newspapers. Prefer the newest page when sources disagree, and say the year.',
  ].join('\n')
}
