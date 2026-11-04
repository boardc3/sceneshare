import { createContext, useContext } from 'react'

// Two languages only: English and Simplified Chinese.
export const LANGS = ['en', 'zh']

const en = {
  brand: 'Sceneshare',
  'nav.signin': 'Sign in',
  'nav.lang': 'Language',
  'nav.start': 'Start with photos',

  'hero.title': 'Walk buyers through your home from anywhere.',
  'hero.lede': 'Enter an address. Sceneshare gathers the listing photos and the location, restyles any room you choose, and gives you one link for buyers who can’t visit in person.',
  'hero.placeholder': 'Street address, city, state',
  'hero.find': 'Find the home',
  'hero.finding': 'Finding…',
  'hero.own': 'Or start with your own photos',
  'hero.mapcaption': 'Satellite view of the coast at Laguna Beach, California',

  'demo.title': 'The same room, proposed.',
  'demo.body': 'Drag across the photo. The camera, walls, windows, ceiling and the view outside stay exactly as photographed. Only finishes, furniture, light and the photo finish change.',
  'demo.before': 'As photographed',
  'demo.after': 'Proposed',
  'demo.placeholder': 'Sample room coming soon',
  'demo.note': 'Sample room created for this page. Every proposal on Sceneshare is a conceptual rendering.',

  'how.title': 'How it works',
  'how.1.t': 'Enter the address',
  'how.1.b': 'We find the home on the map, outline its assessor parcel (Orange County today, more counties to come), and pull its listing photos from Zillow or Redfin when it has them.',
  'how.2.t': 'Restyle, relight, refine',
  'how.2.b': 'Pick a design direction and the light — daylight, golden hour or twilight. Ask for changes in plain words: “walnut floors”, “lighter sofa”. The room’s dimensions never change.',
  'how.3.t': 'Send one link',
  'how.3.b': 'Buyers open the link on any phone and see each room as it is and as it could be, the location, and what’s nearby — in English or Chinese.',

  'lang.title': 'Written for buyers abroad.',
  'lang.body': 'Every shared page switches between English and Simplified Chinese with one tap, including the map labels and the notes on each room.',

  'loc.title': 'Location comes first.',
  'loc.body': 'Every home opens with an interactive map: satellite and street views, the assessor’s parcel outline in Orange County (more counties to come), and the beach, schools, groceries and airport a buyer will ask about.',

  'foot.disclaimer': 'Proposed rooms are conceptual renderings, not photographs of existing conditions. Listing photos remain the property of their photographers and brokers and are credited on every image. Parcel outlines are approximate and are not a survey.',
  'foot.made': 'Sceneshare by Sceneset AI',

  'gate.title': 'Where should we send your link?',
  'gate.body': 'Enter your email to continue. We save your property under it and let you know when accounts open.',
  'gate.email': 'Email address',
  'gate.continue': 'Continue',
  'gate.cancel': 'Not now',
  'gate.invalid': 'Enter a valid email address.',
  'gate.fine': 'No spam. One email when accounts open.',

  'auth.title': 'Accounts are on the way',
  'auth.body': 'Sign-in isn’t open yet. Your properties are saved to the email you entered and will move into your account when it opens.',
  'auth.name': 'Name',
  'auth.email': 'Email',
  'auth.password': 'Password',
  'auth.create': 'Create account',
  'auth.signin': 'Sign in',
  'auth.soon': 'Coming soon',
  'auth.close': 'Close',

  'studio.loading': 'Finding the home…',
  'studio.listing.looking': 'Looking for listing photos on Zillow and Redfin. This can take up to a minute.',
  'studio.listing.found': '{n} listing photos from {src}.',
  'studio.listing.none': 'No listing photos found for this address. Add your own photos to get started.',
  'studio.listing.off': 'Listing photo search is not set up yet.',
  'studio.photos': 'Photos',
  'studio.addPhotos': 'Add photos',
  'studio.takePhoto': 'Take a photo',
  'studio.upload': 'Upload photos',
  'studio.uploading': 'Adding photos…',
  'studio.empty': 'No photos yet. Take or upload photos of each room to begin.',
  'studio.current': 'As photographed',
  'studio.upgraded': 'Proposed',
  'studio.noVersion': 'Choose a direction and light, then press Restyle this room.',
  'studio.mode.redesign': 'Restyle',
  'studio.mode.polish': 'Relight & finish only',
  'studio.style': 'Design direction',
  'studio.light': 'Light',
  'studio.render': 'Restyle this room',
  'studio.renderPolish': 'Relight this photo',
  'studio.rendering': 'Rendering — about 20 seconds',
  'studio.renderAll': 'Restyle all photos',
  'studio.renderingAll': 'Restyling {done} of {total}',
  'studio.feedback': 'Ask for a change',
  'studio.feedbackPh': 'e.g. lighter oak floors, a linen sofa, no rug',
  'studio.apply': 'Apply change',
  'studio.applying': 'Applying…',
  'studio.feedbackNote': 'Walls, windows, ceiling height and the view stay exactly as photographed.',
  'studio.versions': 'Versions',
  'studio.useVersion': 'Show buyers this version',
  'studio.chosen': 'Shown to buyers',
  'studio.hide': 'Hide from buyers',
  'studio.unhide': 'Show to buyers',
  'studio.download': 'Download',
  'studio.share': 'Copy share link',
  'studio.shared': 'Link copied',
  'studio.shareOff': 'Sharing needs the database. Connect Neon in Vercel (DATABASE_URL).',
  'studio.preview': 'Preview buyer page',
  'studio.saved': 'Saved',
  'studio.saving': 'Saving…',
  'studio.credit': 'Photo',
  'studio.ownTitle': 'Your photos',
  'studio.ownLede': 'Add a photo of each room. Hold the phone level at chest height, standing in a corner.',
  'studio.ownAddress': 'Property name or address (optional)',
  'studio.notFound': 'This property isn’t on this device. Open it from the link you were sent.',

  'facts.beds': 'Beds',
  'facts.baths': 'Baths',
  'facts.sqft': 'Interior',
  'facts.lot': 'Lot',
  'facts.built': 'Built',
  'facts.sqftUnit': 'sq ft',
  'facts.acres': 'acres',
  'facts.source': 'Facts from {src}',

  'map.title': 'Location',
  'map.satellite': 'Satellite',
  'map.street': 'Street',
  'map.parcel': 'The parcel',
  'map.area': 'The area',
  'map.home': 'This home',
  'map.parcelLegend': 'Assessor parcel (approximate)',
  'map.pinLegend': 'Geocoded address (approximate)',
  'map.parcelNote': 'Parcel geometry shown is the {county} assessor mapping for APN {apn}. Assessor mapping is approximate and is not a survey or a legal boundary description. Buyers should confirm the parcel and obtain a current survey and title report.',
  'map.pinNote': 'The pin marks the geocoded address and is approximate. Parcel outlines are shown for Orange County, California today.',
  'map.reconcile': 'Assessor parcel ≈ {parcel} sq ft; listed lot size {lot} sq ft ({diff}% apart).',
  'map.poi': '{name} — {dist} {dir}.',
  'map.loading': 'Loading map…',
  'map.unavailable': 'The map isn’t available yet. Add MAPBOX_TOKEN to turn it on.',

  'poi.beach': 'Nearest beach',
  'poi.park': 'Nearest park',
  'poi.school': 'Nearest school',
  'poi.grocery': 'Groceries',
  'poi.cafe': 'Coffee',
  'poi.hospital': 'Hospital',
  'poi.airport': 'Airport',

  'dir.N': 'north', 'dir.NE': 'northeast', 'dir.E': 'east', 'dir.SE': 'southeast',
  'dir.S': 'south', 'dir.SW': 'southwest', 'dir.W': 'west', 'dir.NW': 'northwest',
  'unit.mi': 'mi',

  'style.signature': 'Signature',
  'style.avant-garde': 'Avant-garde',
  'style.timeless-estate': 'Timeless estate',
  'style.pure-form': 'Pure form',
  'style.resort-living': 'Resort living',
  'style.urban-penthouse': 'Urban penthouse',
  'style.coastal-modern': 'Coastal modern',
  'style.executive-modern': 'Executive modern',

  'light.daylight': 'Daylight',
  'light.golden': 'Golden hour',
  'light.twilight': 'Twilight',
  'light.original': 'As photographed',

  'share.lede': 'Each room as photographed and as proposed. Drag across a photo to compare.',
  'share.make': 'Make a page like this for your home',
  'share.rooms': 'Rooms',
  'share.proposalNote': 'Proposed rooms are conceptual renderings. Camera, structure and view are the listing photograph’s; finishes, furniture, lighting and landscape are proposals.',
  'share.loading': 'Opening property…',

  'credit.owner': 'Photo by owner',
  'credit.listing': 'Listing photo via {src}',
  'credit.google': 'Google Maps',

  'err.generic': 'Something went wrong. Try again.',
  'err.network': 'Can’t reach Sceneshare. Check your connection and try again.',
}

const zh = {
  brand: 'Sceneshare',
  'nav.signin': '登录',
  'nav.lang': '语言',
  'nav.start': '从照片开始',

  'hero.title': '无论买家身在何处，都能带他们看房。',
  'hero.lede': '输入地址，Sceneshare 会汇集房源照片和地理位置，按您的选择重新设计任意房间，并生成一个链接，发给无法亲临现场的买家。',
  'hero.placeholder': '街道地址、城市、州',
  'hero.find': '查找房屋',
  'hero.finding': '查找中…',
  'hero.own': '或者从您自己的照片开始',
  'hero.mapcaption': '加州拉古纳海滩海岸卫星图',

  'demo.title': '同一个房间，全新提案。',
  'demo.body': '在照片上左右拖动。相机位置、墙体、窗户、层高以及窗外景色与原照片完全一致，只改变饰面、家具、光线和照片质感。',
  'demo.before': '原始照片',
  'demo.after': '设计提案',
  'demo.placeholder': '示例房间即将上线',
  'demo.note': '本页示例房间为专门制作。Sceneshare 上的所有提案均为概念效果图。',

  'how.title': '使用方式',
  'how.1.t': '输入地址',
  'how.1.b': '我们在地图上定位房屋，标出估税官地块轮廓（目前支持橙县，更多县即将加入）；若房屋在 Zillow 或 Redfin 有房源照片，也会一并获取。',
  'how.2.t': '重新设计、调整光线、细化',
  'how.2.b': '选择设计风格和光线——日光、黄金时刻或黄昏。用日常语言提出修改，例如“胡桃木地板”“浅色沙发”。房间尺寸始终不变。',
  'how.3.t': '发送一个链接',
  'how.3.b': '买家用任何手机打开链接，即可看到每个房间的现状与设计提案、地理位置及周边配套——支持中文和英文。',

  'lang.title': '为海外买家而写。',
  'lang.body': '每个分享页面都可以一键切换英文和简体中文，包括地图标注和每个房间的说明。',

  'loc.title': '位置优先。',
  'loc.body': '每套房屋都从互动地图开始：卫星图和街道图、橙县估税官地块轮廓（更多县即将加入），以及买家会关心的海滩、学校、超市和机场。',

  'foot.disclaimer': '设计提案为概念效果图，并非现状照片。房源照片版权归原摄影师及经纪公司所有，并在每张图片上注明来源。地块轮廓为近似范围，不构成测量依据。',
  'foot.made': 'Sceneshare · Sceneset AI 出品',

  'gate.title': '链接发送到哪个邮箱？',
  'gate.body': '请输入邮箱以继续。我们会将房产保存在该邮箱名下，并在账户功能开放时通知您。',
  'gate.email': '电子邮箱',
  'gate.continue': '继续',
  'gate.cancel': '暂不',
  'gate.invalid': '请输入有效的电子邮箱。',
  'gate.fine': '不发送垃圾邮件，仅在账户开放时通知一次。',

  'auth.title': '账户功能即将推出',
  'auth.body': '登录功能尚未开放。您的房产已保存在所填邮箱名下，账户开放后将自动转入。',
  'auth.name': '姓名',
  'auth.email': '电子邮箱',
  'auth.password': '密码',
  'auth.create': '创建账户',
  'auth.signin': '登录',
  'auth.soon': '即将推出',
  'auth.close': '关闭',

  'studio.loading': '正在查找房屋…',
  'studio.listing.looking': '正在 Zillow 和 Redfin 上查找房源照片，最多需要一分钟。',
  'studio.listing.found': '已从 {src} 获取 {n} 张房源照片。',
  'studio.listing.none': '未找到该地址的房源照片。请添加您自己的照片开始。',
  'studio.listing.off': '房源照片搜索尚未配置。',
  'studio.photos': '照片',
  'studio.addPhotos': '添加照片',
  'studio.takePhoto': '拍照',
  'studio.upload': '上传照片',
  'studio.uploading': '正在添加照片…',
  'studio.empty': '还没有照片。拍摄或上传每个房间的照片即可开始。',
  'studio.current': '原始照片',
  'studio.upgraded': '设计提案',
  'studio.noVersion': '选择设计风格和光线，然后点击“重新设计此房间”。',
  'studio.mode.redesign': '重新设计',
  'studio.mode.polish': '仅调整光线与质感',
  'studio.style': '设计风格',
  'studio.light': '光线',
  'studio.render': '重新设计此房间',
  'studio.renderPolish': '调整此照片光线',
  'studio.rendering': '渲染中——约 20 秒',
  'studio.renderAll': '重新设计全部照片',
  'studio.renderingAll': '正在处理第 {done} / {total} 张',
  'studio.feedback': '提出修改',
  'studio.feedbackPh': '例如：浅色橡木地板、亚麻沙发、去掉地毯',
  'studio.apply': '应用修改',
  'studio.applying': '应用中…',
  'studio.feedbackNote': '墙体、窗户、层高和窗外景色与原照片完全一致。',
  'studio.versions': '版本',
  'studio.useVersion': '向买家展示此版本',
  'studio.chosen': '买家可见',
  'studio.hide': '对买家隐藏',
  'studio.unhide': '对买家显示',
  'studio.download': '下载',
  'studio.share': '复制分享链接',
  'studio.shared': '链接已复制',
  'studio.shareOff': '分享功能需要数据库。请在 Vercel 中连接 Neon（DATABASE_URL）。',
  'studio.preview': '预览买家页面',
  'studio.saved': '已保存',
  'studio.saving': '保存中…',
  'studio.credit': '照片',
  'studio.ownTitle': '您的照片',
  'studio.ownLede': '为每个房间拍一张照片。站在房间一角，手机保持水平，举至胸口高度。',
  'studio.ownAddress': '房产名称或地址（可选）',
  'studio.notFound': '此设备上没有这套房产。请通过收到的链接打开。',

  'facts.beds': '卧室',
  'facts.baths': '浴室',
  'facts.sqft': '室内面积',
  'facts.lot': '占地',
  'facts.built': '建成年份',
  'facts.sqftUnit': '平方英尺',
  'facts.acres': '英亩',
  'facts.source': '资料来源：{src}',

  'map.title': '地理位置',
  'map.satellite': '卫星图',
  'map.street': '街道图',
  'map.parcel': '地块',
  'map.area': '周边',
  'map.home': '本房屋',
  'map.parcelLegend': '估税官地块（近似）',
  'map.pinLegend': '地理编码地址（近似）',
  'map.parcelNote': '图中地块为 {county} 估税官对 APN {apn} 的测绘，仅为近似范围，并非测量或法定边界说明。买家应自行确认地块，并取得最新的测量报告和产权报告。',
  'map.pinNote': '图钉标示地理编码地址，仅为近似位置。目前仅加州橙县显示地块轮廓。',
  'map.reconcile': '估税官地块约 {parcel} 平方英尺；房源标注占地 {lot} 平方英尺（相差 {diff}%）。',
  'map.poi': '{name}——{dir}方向 {dist}。',
  'map.loading': '地图加载中…',
  'map.unavailable': '地图暂不可用。添加 MAPBOX_TOKEN 后即可启用。',

  'poi.beach': '最近的海滩',
  'poi.park': '最近的公园',
  'poi.school': '最近的学校',
  'poi.grocery': '超市',
  'poi.cafe': '咖啡',
  'poi.hospital': '医院',
  'poi.airport': '机场',

  'dir.N': '北', 'dir.NE': '东北', 'dir.E': '东', 'dir.SE': '东南',
  'dir.S': '南', 'dir.SW': '西南', 'dir.W': '西', 'dir.NW': '西北',
  'unit.mi': '英里',

  'style.signature': '招牌风格',
  'style.avant-garde': '先锋前卫',
  'style.timeless-estate': '经典庄园',
  'style.pure-form': '极简纯粹',
  'style.resort-living': '度假生活',
  'style.urban-penthouse': '都市顶层',
  'style.coastal-modern': '现代海岸',
  'style.executive-modern': '现代行政',

  'light.daylight': '日光',
  'light.golden': '黄金时刻',
  'light.twilight': '黄昏',
  'light.original': '保持原样',

  'share.lede': '每个房间的原始照片与设计提案。在照片上拖动即可对比。',
  'share.make': '为您的房屋制作同样的页面',
  'share.rooms': '房间',
  'share.proposalNote': '设计提案为概念效果图。相机位置、结构和景色来自房源照片；饰面、家具、灯光和景观为提案内容。',
  'share.loading': '正在打开房产…',

  'credit.owner': '业主拍摄',
  'credit.listing': '房源照片来自 {src}',
  'credit.google': 'Google 地图',

  'err.generic': '出现问题，请重试。',
  'err.network': '无法连接 Sceneshare，请检查网络后重试。',
}

export const DICTS = { en, zh }

export function translate(lang, key, vars) {
  let s = DICTS[lang]?.[key] ?? DICTS.en[key] ?? key
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v))
  return s
}

export const I18n = createContext({ lang: 'en', setLang: () => {}, t: (k) => k })
export const useI18n = () => useContext(I18n)

// Credit line for a photo, in the reader's language. Brand names stay as they are.
export function creditText(photo, t) {
  if (!photo) return ''
  if (photo.source === 'owner') return t('credit.owner')
  if (photo.source === 'zillow') return t('credit.listing', { src: 'Zillow' })
  if (photo.source === 'redfin') return t('credit.listing', { src: 'Redfin' })
  if (photo.source === 'google') return photo.credit ? photo.credit.replace(/^Google Maps/, t('credit.google')) : t('credit.google')
  return photo.credit || ''
}

export function compass(deg) {
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']
  return dirs[Math.round((((deg % 360) + 360) % 360) / 45) % 8]
}
