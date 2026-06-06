import { ENQUIRY_FN_URL as FUNCTION_URL } from './config.js'
import { track } from './analytics.js'
import { initStickyShadow } from './sticky.js'

export function initEnquire() {
  const steps = [1, 2, 3, 4].map(n => document.getElementById('step-' + n))
  if (!steps[0]) return

  const fill      = document.getElementById('progress-fill')
  const pct       = document.getElementById('progress-pct')
  const track2    = document.querySelector('.progress-bar-track')
  const progSteps = document.querySelectorAll('.progress-step')
  const stepNames = [...progSteps].map(s => s.querySelector('.step-name')?.textContent.trim() || '')
  const TOTAL     = 4
  let   active    = 1   // the step that's currently open
  let   reached   = 1   // the furthest step the user has unlocked

  // ── Progress bar sticky shadow ─────────────────────────────────────────────
  initStickyShadow(document.getElementById('progress-wrap'))

  // ── Date helpers (shared by the date validators + native picker bounds) ────
  const pad = n => String(n).padStart(2, '0')
  function todayISO() {
    const d = new Date()
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  }
  // Parse a strict YYYY-MM-DD, rejecting impossible dates (e.g. 2024-02-31).
  function parseDate(v) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v)
    if (!m) return null
    const [y, mo, d] = [+m[1], +m[2], +m[3]]
    const dt = new Date(y, mo - 1, d)
    return (dt.getFullYear() === y && dt.getMonth() === mo - 1 && dt.getDate() === d) ? dt : null
  }
  function midnight(d) { const c = new Date(d); c.setHours(0, 0, 0, 0); return c }

  // ── Field validators (keyed by element id) ────────────────────────────────
  // Each returns '' when valid, or a human message when not. Plausibility, not
  // just shape: a real-looking name, a deliverable-looking email, a date of birth
  // that makes the enquirer 18–120, and appointment dates that sit in the future
  // and in the right order.
  const NAME_RE  = /^[\p{L}][\p{L}\p{M} .'’\-]{0,48}$/u
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

  function validateName(v) {
    return NAME_RE.test(v) ? '' : 'Please use letters only (no numbers or symbols).'
  }
  function validateEmail(v) {
    return EMAIL_RE.test(v) ? '' : 'Please enter a valid email, like you@email.com.'
  }
  function validateDob(v) {
    const d = parseDate(v)
    if (!d) return 'Please enter a valid date.'
    const today = midnight(new Date())
    if (d > today) return 'That date is in the future.'
    let age = today.getFullYear() - d.getFullYear()
    const m = today.getMonth() - d.getMonth()
    if (m < 0 || (m === 0 && today.getDate() < d.getDate())) age--
    if (age < 18)  return 'Sorry — I only tattoo over-18s.'
    if (age > 120) return 'Please double-check your date of birth.'
    return ''
  }
  // Appointment windows: optional, but if given must be a real, future-ish date.
  function validateBookingDate(v) {
    const d = parseDate(v)
    if (!d) return 'Please enter a valid date.'
    const today = midnight(new Date())
    if (d < today) return 'Please choose a date in the future.'
    const max = midnight(new Date()); max.setFullYear(max.getFullYear() + 2)
    if (d > max) return 'That date is a little too far ahead.'
    return ''
  }
  function validateDateTo(v) {
    const base = validateBookingDate(v)
    if (base) return base
    const from = parseDate(document.getElementById('date-from')?.value || '')
    const to   = parseDate(v)
    if (from && to && to < from) return 'This should be on or after the earliest date.'
    return ''
  }

  const validators = {
    'first-name': validateName,
    'last-name':  validateName,
    'email':      validateEmail,
    'dob':        validateDob,
    'date-from':  validateBookingDate,
    'date-to':    validateDateTo,
  }

  // Bound the native date pickers so the obvious mistakes can't be picked at all.
  const today = todayISO()
  const dobEl = document.getElementById('dob')
  if (dobEl) dobEl.max = today
  ;['date-from', 'date-to'].forEach(id => {
    const el = document.getElementById(id)
    if (el) el.min = today
  })

  // ── Per-field error display ───────────────────────────────────────────────
  function fieldErrorFor(el) {
    if (el.disabled) return ''
    const required = el.hasAttribute('required')
    if (el.type === 'radio') {
      const scope = el.closest('.form-step') || document
      return required && !scope.querySelector(`[name="${el.name}"]:checked`)
        ? 'Please choose an option.' : ''
    }
    if (el.type === 'checkbox') {
      return required && !el.checked ? 'Please tick this to continue.' : ''
    }
    const val = (el.value || '').trim()
    if (!val) return required ? 'This can’t be left empty.' : ''
    const fn = validators[el.id]
    return fn ? fn(val, el) : ''
  }

  function applyFieldError(field, el, msg) {
    if (!field) return
    field.classList.toggle('error', !!msg)
    let m = field.querySelector('.field-error-msg')
    if (msg) {
      if (!m) {
        m = document.createElement('p')
        m.className = 'field-error-msg'
        m.setAttribute('role', 'alert')
        field.appendChild(m)
      }
      m.textContent = msg
      el?.setAttribute('aria-invalid', 'true')
    } else {
      m?.remove()
      el?.removeAttribute('aria-invalid')
    }
  }

  // ── Step management (accordion) ───────────────────────────────────────────
  // Only the active step is expanded. Completed steps collapse to a clickable
  // summary header (with an Edit affordance); steps the user hasn't reached yet
  // stay hidden until they're unlocked.
  function render() {
    steps.forEach((s, i) => {
      if (!s) return
      const n = i + 1
      const isActive   = n === active
      const isComplete = !isActive && n <= reached
      const isUpcoming = n > reached
      s.classList.toggle('active', isActive)
      s.classList.toggle('complete', isComplete)
      s.classList.toggle('upcoming', isUpcoming)
      // Hidden upcoming steps are kept out of the tab order and the a11y tree.
      s.toggleAttribute('inert', isUpcoming)
    })
    if (fill) fill.style.width = (active / TOTAL * 100) + '%'
    if (track2) track2.setAttribute('aria-valuenow', String(active))
    if (pct) {
      const name = stepNames[active - 1]
      pct.textContent = `Step ${active} of ${TOTAL}${name ? ' — ' + name : ''}`
    }
    progSteps.forEach((ps, i) => {
      ps.classList.toggle('done',    i + 1 < active)
      ps.classList.toggle('current', i + 1 === active)
    })
    try { sessionStorage.setItem('beansprout_step', active) } catch (_) {}
  }

  function setStep(n) {
    active  = n
    reached = Math.max(reached, n)
    render()
    const target = document.getElementById('step-' + active)
    if (target && window.innerWidth < 900) {
      setTimeout(() => target.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100)
    }
  }

  // ── Validation ────────────────────────────────────────────────────────────
  // A .field can hold several controls (e.g. the three consent checkboxes, or a
  // radio-card group), so error state is computed per *field*, not per control —
  // otherwise ticking one box would clear the whole field while others are still
  // empty. controlsIn() collects the required + format-validated controls in a
  // field; the field shows the first outstanding message.
  function controlsIn(field) {
    const set = new Set(field.querySelectorAll('[required]'))
    field.querySelectorAll('[id]').forEach(el => { if (validators[el.id]) set.add(el) })
    return [...set]
  }
  function refreshField(field) {
    const controls = controlsIn(field)
    let bad = null
    for (const el of controls) { if (fieldErrorFor(el)) { bad = el; break } }
    applyFieldError(field, bad || controls[0], bad ? fieldErrorFor(bad) : '')
    return !bad
  }
  function validateStep(n) {
    const step = document.getElementById('step-' + n)
    if (!step) return true
    const fields = new Set()
    step.querySelectorAll('[required]').forEach(el => {
      const f = el.closest('.field'); if (f) fields.add(f)
    })
    step.querySelectorAll('[id]').forEach(el => {
      if (validators[el.id]) { const f = el.closest('.field'); if (f) fields.add(f) }
    })
    let ok = true
    fields.forEach(f => { if (!refreshField(f)) ok = false })
    return ok
  }

  // Clear a field's error live, once it's been flagged — never nag before submit.
  document.querySelectorAll('#enquiry-form input, #enquiry-form select, #enquiry-form textarea')
    .forEach(el => {
      const refresh = () => {
        const field = el.closest('.field')
        if (field?.classList.contains('error')) refreshField(field)
      }
      el.addEventListener('input', refresh)
      el.addEventListener('change', refresh)
    })

  // ── Next / back / edit wiring ─────────────────────────────────────────────
  ;[['step1-next', 1], ['step2-next', 2], ['step3-next', 3]].forEach(([id, n]) => {
    document.getElementById(id)?.addEventListener('click', () => {
      if (validateStep(n)) setStep(n + 1)
    })
  })

  ;['step2-back', 'step3-back', 'step4-back'].forEach((id, i) => {
    document.getElementById(id)?.addEventListener('click', () => setStep(i + 1))
  })

  // A completed step's header (and its Edit button) re-opens it for changes.
  steps.forEach(step => {
    step?.querySelector('.step-header')?.addEventListener('click', () => {
      if (step.classList.contains('complete')) setStep(+step.dataset.step)
    })
  })

  // ── Pill multi-select cap — honour data-max on a .pill-group ──────────────
  // When the group is at its limit, unchecked pills are disabled so the user
  // can't exceed it; deselecting one re-enables the rest. Named so a conditional
  // that re-reveals a capped group can re-apply it.
  function enforceCap(group) {
    const max = parseInt(group.dataset.max, 10)
    if (!max) return
    const boxes   = [...group.querySelectorAll('input[type="checkbox"]')]
    const atLimit = boxes.filter(b => b.checked).length >= max
    boxes.forEach(b => {
      b.disabled = atLimit && !b.checked
      b.closest('.pill')?.classList.toggle('disabled', b.disabled)
    })
  }
  document.querySelectorAll('.pill-group[data-max]').forEach(group => {
    group.querySelectorAll('input[type="checkbox"]')
      .forEach(b => b.addEventListener('change', () => enforceCap(group)))
    enforceCap(group)
  })

  // ── Conditional field groups ──────────────────────────────────────────────
  // Show/hide a group AND keep its inputs out of the submitted payload while
  // hidden — disabled inputs aren't serialised, so a flash enquiry won't carry
  // stale custom-only answers (and a "no cover-up" enquiry won't carry a photo).
  function toggleConditional(field, show) {
    if (!field) return
    field.style.display = show ? '' : 'none'
    field.querySelectorAll('input, textarea, select').forEach(el => {
      el.disabled = !show
    })
    if (show) field.querySelectorAll('.pill-group[data-max]').forEach(enforceCap)
  }

  // Flash is pre-drawn → hide the custom idea + style/colour fields.
  const ideaField  = document.getElementById('idea-field')
  const styleField = document.getElementById('style-field')
  document.querySelectorAll('[name="tattoo_type"]').forEach(r => {
    r.addEventListener('change', () => {
      const isFlash = r.value === 'flash'
      toggleConditional(ideaField,  !isFlash)
      toggleConditional(styleField, !isFlash)
    })
  })

  // Cover-up photo upload (step 3) — only when "yes".
  const coverupField = document.getElementById('coverup-field')
  document.querySelectorAll('[name="coverup"]').forEach(r => {
    r.addEventListener('change', () => {
      toggleConditional(coverupField, r.value === 'yes')
    })
  })
  // Cover-up starts hidden in the markup — disable its inputs to match.
  toggleConditional(coverupField, false)

  // ── File upload preview ────────────────────────────────────────────────────
  const refsInput = document.getElementById('refs')
  const thumbRow  = document.getElementById('thumb-row')
  if (refsInput && thumbRow) {
    refsInput.addEventListener('change', () => {
      thumbRow.innerHTML = ''
      Array.from(refsInput.files).slice(0, 8).forEach(file => {
        const url   = URL.createObjectURL(file)
        const thumb = document.createElement('div')
        thumb.className = 'thumb'
        // Build via DOM properties — file.name is user-controlled, so never
        // interpolate it into innerHTML (attribute-break / onerror injection).
        const img = document.createElement('img')
        // Free the blob URL once the browser has the decoded image, so repeated
        // re-selections don't leak object URLs for the session.
        img.onload = () => URL.revokeObjectURL(url)
        img.src = url
        img.alt = file.name
        thumb.appendChild(img)
        thumbRow.appendChild(thumb)
      })
    })
  }

  // ── Checkbox visual fallback (for browsers without :has) ──────────────────
  document.querySelectorAll('.checkbox-row input[type="checkbox"]').forEach(cb => {
    cb.addEventListener('change', () => {
      cb.parentElement.querySelector('.checkbox-box')
        ?.classList.toggle('checked', cb.checked)
    })
  })

  // ── Pill fallback ─────────────────────────────────────────────────────────
  document.querySelectorAll('.pill input[type="checkbox"]').forEach(cb => {
    cb.addEventListener('change', () =>
      cb.closest('.pill')?.classList.toggle('checked', cb.checked)
    )
  })

  // ── Restore from sessionStorage ───────────────────────────────────────────
  try {
    const saved = parseInt(sessionStorage.getItem('beansprout_step'))
    if (saved > 1 && saved <= TOTAL) setStep(saved)
  } catch (_) {}

  // ── Submit → Cloudflare Worker → Resend ───────────────────────────────────
  // FUNCTION_URL is the shared endpoint (see config.js / .env.example).
  const MAX_IMAGES      = 8
  const MAX_FILE_MB     = 8               // ceiling for originals we can't downscale (e.g. HEIC)
  const MAX_TOTAL_BYTES = 5 * 1024 * 1024 // self-imposed cap to keep the JSON POST small

  function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const r = new FileReader()
      r.onload  = () => resolve(String(r.result).split(',')[1] || '')
      r.onerror = reject
      r.readAsDataURL(blob)
    })
  }

  // Shrink large phone photos so several references fit under the POST cap.
  // Returns a JPEG Blob, or null if the browser can't decode the file (e.g. HEIC),
  // letting the caller fall back to sending the original.
  async function downscaleImage(file, maxEdge = 1600, quality = 0.82) {
    if (!file.type.startsWith('image/')) return null
    try {
      const bitmap = await createImageBitmap(file)
      const scale  = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height))
      const w = Math.round(bitmap.width * scale)
      const h = Math.round(bitmap.height * scale)
      const canvas = document.createElement('canvas')
      canvas.width = w; canvas.height = h
      canvas.getContext('2d').drawImage(bitmap, 0, 0, w, h)
      bitmap.close?.()
      return await new Promise(res => canvas.toBlob(res, 'image/jpeg', quality))
    } catch (_) {
      return null
    }
  }

  async function collectImages() {
    const inputs = [document.getElementById('refs'), document.getElementById('coverup-img')]
    const files  = []
    inputs.forEach(inp => { if (inp && !inp.disabled) files.push(...Array.from(inp.files)) })

    if (files.length > MAX_IMAGES) throw new Error(`Please attach no more than ${MAX_IMAGES} images.`)

    const out = []
    let total = 0
    for (const file of files) {
      const shrunk = await downscaleImage(file)
      let blob, name
      if (shrunk) {
        blob = shrunk
        name = file.name.replace(/\.(heic|heif|png|webp|jpeg)$/i, '.jpg')
      } else {
        if (file.size > MAX_FILE_MB * 1024 * 1024)
          throw new Error(`“${file.name}” is too large (max ${MAX_FILE_MB} MB).`)
        blob = file
        name = file.name
      }
      const data = await blobToBase64(blob)
      total += Math.floor(data.length * 3 / 4)
      out.push({ name, type: blob.type || 'image/jpeg', data })
    }
    if (total > MAX_TOTAL_BYTES)
      throw new Error('Your images are too large even after compression — please remove some.')
    return out
  }

  // Serialise the form to a plain object. Disabled inputs (hidden conditionals)
  // and file inputs are skipped; multi-selects keep their `name[]` key as arrays.
  function collectFields(form) {
    const data = {}
    for (const el of form.elements) {
      if (!el.name || el.disabled || el.type === 'file') continue
      if (el.name.endsWith('[]')) {
        if (el.checked) (data[el.name] ||= []).push(el.value)
      } else if (el.type === 'radio') {
        if (el.checked) data[el.name] = el.value
      } else if (el.type === 'checkbox') {
        if (el.checked) data[el.name] = 'on'
      } else {
        data[el.name] = el.value
      }
    }
    return data
  }

  function showFormError(msg) {
    let b = document.getElementById('form-error-banner')
    if (!b) {
      b = document.createElement('div')
      b.id = 'form-error-banner'
      b.setAttribute('role', 'alert')
      b.style.cssText = 'margin-top:16px;padding:14px 18px;background:#FBE8E4;' +
        'border:1px solid var(--clay,#C45A3E);border-radius:var(--radius,8px);' +
        'font-size:14px;color:#C45A3E;line-height:1.5'
      document.querySelector('#step-4 .step-footer')?.after(b)
    }
    b.textContent = msg
    b.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }
  const clearFormError = () => document.getElementById('form-error-banner')?.remove()

  // The form is novalidate and Next only validated steps 1-3 — re-check every
  // step so the step-4 consent boxes can't be bypassed; jump to the first gap.
  const form = document.getElementById('enquiry-form')
  form?.addEventListener('submit', async e => {
    e.preventDefault()

    let firstBad = null
    for (let n = 1; n <= TOTAL; n++) if (!validateStep(n) && firstBad === null) firstBad = n
    if (firstBad !== null) {
      setStep(firstBad)
      document.querySelector(`#step-${firstBad} .field.error`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      return
    }

    const btn   = document.getElementById('submit-btn')
    const label = btn?.textContent
    clearFormError()
    if (btn) { btn.disabled = true; btn.textContent = 'Sending…' }

    try {
      const fields = collectFields(form)
      const images = await collectImages()
      const res = await fetch(FUNCTION_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields, images }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || 'Something went wrong. Please try again.')

      track('enquiry_submit', { type: fields.tattoo_type || 'unknown' })
      try { sessionStorage.removeItem('beansprout_step') } catch (_) {}
      window.location.href = '/enquiry-received/'
    } catch (err) {
      console.error('Enquiry error:', err)
      showFormError(err.message || 'Something went wrong. Please try again, or email hello@beansprout.ink directly.')
      if (btn) { btn.disabled = false; btn.textContent = label || 'Send my enquiry' }
    }
  })
}
