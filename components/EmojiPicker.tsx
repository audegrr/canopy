'use client'
import { useState, useRef, useEffect, useMemo } from 'react'

const CATEGORIES: { label: string; icon: string; emojis: string[] }[] = [
  { label: 'Common', icon: '⭐', emojis: ['📄','📝','📌','⭐','🔥','💡','🎯','📊','🗂','🌿','🚀','💎','🎨','🔑','📦','🌍','💬','🧠','✅','🎉','🏠','🔧','📚','🎵','🌸','⚡','🦋','🌊','🏔','🎭','📐','🔬','🌈','🍀','🦁','🐋','🌙','☀️','🎪','🏆'] },
  { label: 'Smileys', icon: '😀', emojis: ['😀','😃','😄','😁','😆','😅','🤣','😂','🙂','🙃','😉','😊','😇','🥰','😍','🤩','😘','😗','😚','😙','🥲','😋','😛','😜','🤪','😝','🤑','🤗','🤭','🤫','🤔','🤐','🤨','😐','😑','😶','😏','😒','🙄','😬','🤥','😌','😔','😪','🤤','😴','😷','🤒','🤕','🤢','🤮','🤧','🥵','🥶','🥴','😵','🤯','🤠','🥸','🥳','😎','🤓','🧐','😕','😟','🙁','☹️','😮','😯','😲','😳','🥺','😦','😧','😨','😰','😥','😢','😭','😱','😖','😣','😞','😓','😩','😫','🥱','😤','😡','😠','🤬','😈','👿','💀','☠️','💩','🤡','👹','👺','👻','👽','👾','🤖'] },
  { label: 'People', icon: '👋', emojis: ['👋','🤚','🖐','✋','🖖','👌','🤌','🤏','✌️','🤞','🤟','🤘','🤙','👈','👉','👆','🖕','👇','☝️','👍','👎','✊','👊','🤛','🤜','👏','🙌','👐','🤲','🤝','🙏','✍️','💅','🤳','💪','🦾','🦿','🦵','🦶','👂','🦻','👃','🧠','🫀','🫁','🦷','🦴','👀','👁','👅','👄','🫦','👶','🧒','👦','👧','🧑','👱','👨','🧔','👩','🧓','👴','👵','🙍','🙎','🙅','🙆','💁','🙋','🧏','🙇','🤦','🤷','👮','🕵️','💂','🥷','👷','🤴','👸','👳','👲','🧕','🤵','👰','🤰','🤱','👼','🎅','🤶','🦸','🦹','🧙','🧚','🧛','🧜','🧝','🧞','🧟','🧌','💆','💇','🚶','🧍','🧎','🏃','💃','🕺','🕴','👯','🧖','🧗','🤺','🏇','⛷','🏂','🪂','🏋','🤼','🤸','🤽','🤾','🤹','🧘','🛀','🛌','🧑‍🤝‍🧑','👫','👬','👭','💏','💑','👪'] },
  { label: 'Animals', icon: '🐶', emojis: ['🐶','🐱','🐭','🐹','🐰','🦊','🐻','🐼','🐻‍❄️','🐨','🐯','🦁','🐮','🐷','🐸','🐵','🙈','🙉','🙊','🐔','🐧','🐦','🐤','🦆','🦅','🦉','🦇','🐺','🐗','🐴','🦄','🐝','🪱','🐛','🦋','🐌','🐞','🐜','🪲','🦟','🦗','🪳','🦂','🐢','🐍','🦎','🦖','🦕','🐙','🦑','🦐','🦞','🦀','🐡','🐠','🐟','🐬','🐳','🐋','🦈','🐊','🐅','🐆','🦓','🦍','🦧','🦣','🐘','🦛','🦏','🐪','🐫','🦒','🦘','🦬','🐃','🐂','🐄','🐎','🐖','🐏','🐑','🦙','🐐','🦌','🐕','🐩','🦮','🐈','🐓','🦃','🦤','🦚','🦜','🦢','🦩','🕊','🐇','🦝','🦨','🦡','🦫','🦦','🦥','🐁','🐀','🐿','🦔'] },
  { label: 'Food', icon: '🍕', emojis: ['🍏','🍎','🍐','🍊','🍋','🍌','🍉','🍇','🍓','🫐','🍈','🍒','🍑','🥭','🍍','🥥','🥝','🍅','🍆','🥑','🥦','🫛','🥬','🥒','🌶','🫑','🧄','🧅','🥔','🍠','🫚','🥐','🥯','🍞','🥖','🥨','🧀','🥚','🍳','🧈','🥞','🧇','🥓','🥩','🍗','🍖','🦴','🌭','🍔','🍟','🍕','🫓','🥪','🥙','🧆','🌮','🌯','🫔','🥗','🥘','🫕','🥫','🍝','🍜','🍲','🍛','🍣','🍱','🥟','🦪','🍤','🍙','🍚','🍘','🍥','🥮','🍢','🧁','🍰','🎂','🍮','🍭','🍬','🍫','🍿','🍩','🍪','🌰','🥜','🍯','🧃','🥤','🧋','☕','🫖','🍵','🧉','🍺','🍻','🥂','🍷','🫗','🥃','🍸','🍹','🧊','🥄','🍴','🫙'] },
  { label: 'Travel', icon: '✈️', emojis: ['🚀','🛸','🚁','🛶','⛵','🚤','🛥','🛳','⛴','🚢','✈️','🛩','🛫','🛬','🪂','💺','🚂','🚃','🚄','🚅','🚆','🚇','🚈','🚉','🚊','🚝','🚞','🚋','🚌','🚍','🚎','🚐','🚑','🚒','🚓','🚔','🚕','🚖','🚗','🚘','🚙','🛻','🚚','🚛','🚜','🏎','🏍','🛵','🦽','🦼','🛺','🚲','🛴','🛹','🛼','🚏','🛣','🛤','⛽','🛞','🚨','🚥','🚦','🛑','🚧','⚓','🪝','⛵','🚣','🛶','🏊','🧗','🏌','🏇','🤸','⛷','🏋','🤼','🤺','🛹','🏄','🚵','🏆','🥇','🥈','🥉','🏅','🎖','🎗','🎫','🎟','🎪','🎭','🎨','🖼','🎰','🎲','♟','🧩','🎮','🕹','🎯','🎳','🎻','🎺','🥁','🪘','🎸','🪕','🎷','🎹','🎵','🎶','🎤','🎧','📻','🎙','📢','📣'] },
  { label: 'Objects', icon: '💼', emojis: ['💼','📁','📂','🗂','📋','📊','📈','📉','🗒','🗓','📆','📅','🗑','📇','📌','📍','✂️','🖇','📎','🔗','📏','📐','✒️','🖋','✏️','🖊','🖌','🖍','📝','🔍','🔎','🔏','🔐','🔒','🔓','🔑','🗝','🔨','🪓','⛏','⚒','🛠','🗡','⚔️','🛡','🔧','🔩','⚙️','🗜','⚖️','🦯','🔗','⛓','🪝','🧰','🧲','🪜','⚗️','🧪','🧫','🧬','🔭','🔬','🩺','💊','🩹','🩼','🩻','🚪','🛋','🪑','🚿','🛁','🧴','🧷','🧹','🧺','🧻','🪣','🧼','🫧','🪥','🧽','🪒','🧯','🪤','🛒','💡','🔦','🕯','🪔','🧱','🪞','🖥','🖨','⌨️','🖱','🖲','💾','💿','📀','📼','📷','📸','📹','🎥','📽','🎞','📞','☎️','📟','📠','📺','📻','🧭','⏱','⏲','⏰','🕰','⌛','⏳','📡','🔋','🪫','🔌','💻','📱','📲','💬','📩','📨','📧','📫','📪','📬','📭','📮','🗳','✏️','📏','📌','🗺','🌐'] },
  { label: 'Symbols', icon: '❤️', emojis: ['❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💔','❣️','💕','💞','💓','💗','💖','💘','💝','💟','☮️','✝️','☪️','🕉','☯️','✡️','🔯','🕎','☦️','⛎','♈','♉','♊','♋','♌','♍','♎','♏','♐','♑','♒','♓','🆔','⚛️','🉑','☢️','☣️','📴','📳','🈶','🈚','🈸','🈺','🈷️','✴️','🆚','💮','🉐','㊙️','㊗️','🈴','🈵','🈹','🈲','🅰️','🅱️','🆎','🆑','🅾️','🆘','❌','⭕','🛑','⛔','📛','🚫','💯','💢','♨️','🚷','🚯','🚳','🚱','🔞','📵','🚭','❗','❕','❓','❔','‼️','⁉️','🔅','🔆','〽️','⚠️','🚸','🔱','⚜️','🔰','♻️','✅','🈯','💹','❎','🌐','💠','Ⓜ️','🌀','💤','🏧','🚾','♿','🅿️','🛗','🈳','🈂️','🛂','🛃','🛄','🛅','🚹','🚺','🚼','⚧️','🚻','🚮','🎦','📶','🈁','🔣','ℹ️','🔤','🔡','🔠','🆖','🆗','🆙','🆒','🆕','🆓','0️⃣','1️⃣','2️⃣','3️⃣','4️⃣','5️⃣','6️⃣','7️⃣','8️⃣','9️⃣','🔟','🔢','⏏️','▶️','⏸','⏹','⏺','⏭','⏮','⏩','⏪','⏫','⏬','◀️','🔼','🔽','➡️','⬅️','⬆️','⬇️','↗️','↘️','↙️','↖️','↕️','↔️','↪️','↩️','⤴️','⤵️','🔀','🔁','🔂','🔄','🔃','🎵','🎶','➕','➖','➗','✖️','♾️','💲','💱','™️','©️','®️','〰️','➰','➿','🔚','🔙','🔛','🔝','🔜','✔️','☑️','🔘','🔴','🟠','🟡','🟢','🔵','🟣','⚫','⚪','🟤','🔺','🔻','🔷','🔶','🔹','🔸','🔳','🔲','▪️','▫️','◾','◽','◼️','◻️','🟥','🟧','🟨','🟩','🟦','🟪','⬛','⬜','🟫','🔈','🔇','🔉','🔊','🔔','🔕','📣','📢','💬','💭','🗯','♠️','♣️','♥️','♦️','🃏','🀄','🎴'] },
]

type Props = {
  onSelect: (emoji: string) => void
  onClose: () => void
  style?: React.CSSProperties
}

export default function EmojiPicker({ onSelect, onClose, style }: Props) {
  const [query, setQuery] = useState('')
  const [activeCategory, setActiveCategory] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  const filtered = useMemo(() => {
    if (!query.trim()) return null
    const q = query.toLowerCase()
    return CATEGORIES.flatMap(c => c.emojis).filter(e => e.includes(q))
  }, [query])

  function selectCategory(i: number) {
    setActiveCategory(i)
    setQuery('')
    scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const displayEmojis = filtered ?? CATEGORIES[activeCategory]?.emojis ?? []

  return (
    <>
      <div style={{ position: 'fixed', inset: 0, zIndex: 999 }} onClick={onClose} />
      <div onClick={e => e.stopPropagation()}
        style={{ position: 'absolute', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '10px', boxShadow: 'var(--shadow-lg)', zIndex: 1000, width: '300px', overflow: 'hidden', ...style }}>
        {/* Search */}
        <div style={{ padding: '8px', borderBottom: '1px solid var(--border)' }}>
          <input ref={inputRef} value={query} onChange={e => setQuery(e.target.value)}
            placeholder="Search emoji…"
            style={{ width: '100%', padding: '6px 10px', border: '1px solid var(--border)', borderRadius: '6px', fontSize: '13px', fontFamily: 'var(--font-sans)', outline: 'none', background: 'var(--sidebar-bg)', color: 'var(--text)', boxSizing: 'border-box' }} />
        </div>

        {/* Category tabs */}
        {!query && (
          <div style={{ display: 'flex', overflowX: 'auto', padding: '4px 6px', gap: '2px', borderBottom: '1px solid var(--border)', scrollbarWidth: 'none' }}>
            {CATEGORIES.map((cat, i) => (
              <button key={cat.label} onClick={() => selectCategory(i)}
                title={cat.label}
                style={{ flexShrink: 0, background: i === activeCategory ? 'var(--accent-light)' : 'none', border: 'none', borderRadius: '5px', padding: '4px 6px', fontSize: '16px', cursor: 'pointer', lineHeight: 1 }}>
                {cat.icon}
              </button>
            ))}
          </div>
        )}

        {/* Grid */}
        <div ref={scrollRef} style={{ display: 'flex', flexWrap: 'wrap', gap: '2px', padding: '8px', maxHeight: '220px', overflowY: 'auto' }}>
          {displayEmojis.length === 0 ? (
            <div style={{ width: '100%', textAlign: 'center', padding: '20px', fontSize: '13px', color: 'var(--text-tertiary)' }}>No results</div>
          ) : displayEmojis.map((em, i) => (
            <button key={i} onClick={() => { onSelect(em); onClose() }}
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '20px', padding: '4px', borderRadius: '5px', lineHeight: 1 }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--sidebar-hover)' }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'none' }}>
              {em}
            </button>
          ))}
        </div>

        {/* Remove icon option */}
        <div style={{ borderTop: '1px solid var(--border)', padding: '4px 8px' }}>
          <button onClick={() => { onSelect(''); onClose() }}
            style={{ width: '100%', background: 'none', border: 'none', cursor: 'pointer', fontSize: '12px', color: 'var(--text-tertiary)', padding: '4px', borderRadius: '4px', fontFamily: 'var(--font-sans)' }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--sidebar-hover)' }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'none' }}>
            Remove icon
          </button>
        </div>
      </div>
    </>
  )
}
