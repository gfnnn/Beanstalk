import { ENQUIRY_FN_URL as FUNCTION_URL } from './config.js'

export function initEnquire() {
  const steps = [1, 2, 3, 4].map(n => document.getElementById('step-' + n))
  if (!steps[0]) return

  const fill      = document.getElementById('progress-fill')
  const pct       = document.getElementById('progress-pct')
  const progSteps = document.querySelectorAll('.progress-step')
  let   current   = 1
  const TOTAL     = 4

  // ── Progress bar sticky shadow ─────────────────────────────────────────────
  const progressWrap = document.getElementById('progress-wrap')
  if (progressWrap) {
    const navH = parseInt(
      getComputedStyle(document.documentElement).getPropertyValue('--nav-h')
    ) || 65
    const obs = new IntersectionObserver(
      ([e]) => progressWrap.classList.toggle('stuck', !e.isIntersecting),
      { threshold: 1, rootMargin: `-${navH}px 0px 0px 0px` }
    )
    obs.observe(progressWrap)
  }

  // ── Step management ────────────────────────────────────────────────────────
  function setStep(n) {
    current = n
    steps.forEach((s, i) => {
      if (!s) return
      const sNum = i + 1
      s.classList.toggle('inactive', sNum > current)
      s.classList.toggle('complete', sNum < current)
    })
    if (fill) fill.style.width = (current / TOTAL * 100) + '%'
    if (pct)  pct.textContent = 'Step ' + current + ' of ' + TOTAL
    progSteps.forEach((ps, i) => {
      ps.classList.toggle('done',    i + 1 < current)
      ps.classList.toggle('current', i + 1 === current)
    })
    if (window.innerWidth < 900) {
      const activeStep = document.getElementById('step-' + current)
      if (activeStep) {
        setTimeout(() => activeStep.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100)
      }
    }
    try { sessionStorage.setItem('beansprout_step', current) } catch (_) {}
  }

  // ── Validation ────────────────────────────────────────────────────────────
  function validateStep(n) {
    const step = document.getElementById('step-' + n)
    if (!step) return true
    const required = step.querySelectorAll('[required]')
    let ok = true
    required.forEach(el => {
      const field = el.closest('.field')
      const invalid =
        el.type === 'radio'    ? !step.querySelector(`[name="${el.name}"]:checked`)
        : el.type === 'checkbox' ? !el.checked
        : !el.value.trim()
      if (field) field.classList.toggle('error', invalid)
      if (invalid) ok = false
    })
    return ok
  }

  // ── Next / back wiring ─────────────────────────────────────────────────────
  ;[['step1-next', 1], ['step2-next', 2], ['step3-next', 3]].forEach(([id, n]) => {
    document.getElementById(id)?.addEventListener('click', () => {
      if (validateStep(n)) setStep(n + 1)
    })
  })

  ;['step2-back', 'step3-back', 'step4-back'].forEach((id, i) => {
    document.getElementById(id)?.addEventListener('click', () => setStep(i + 1))
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
      Array.from(refsInput.files).slice(0, 7).forEach(file => {
        const url   = URL.createObjectURL(file)
        const thumb = document.createElement('div')
        thumb.className = 'thumb'
        thumb.innerHTML = `<img src="${url}" alt="${file.name}">`
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

  // ── Submit → Netlify function → Resend ────────────────────────────────────
  // FUNCTION_URL is the shared endpoint (see config.js / .env.example).
  const MAX_IMAGES      = 8
  const MAX_FILE_MB     = 8               // ceiling for originals we can't downscale (e.g. HEIC)
  const MAX_TOTAL_BYTES = 5 * 1024 * 1024 // keep the JSON POST under Netlify's ~6 MB cap

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

    if (FUNCTION_URL.includes('YOUR-SITE')) {
      showFormError('The enquiry form isn’t connected yet. (Set VITE_ENQUIRY_FN_URL to your Netlify function URL.)')
      return
    }

    const btn   = document.getElementById('submit-btn')
    const label = btn?.textContent
    clearFormError()
    if (btn) { btn.disabled = true; btn.textContent = 'Sending… 🌱' }

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

      try { sessionStorage.removeItem('beansprout_step') } catch (_) {}
      window.location.href = '/enquiry-received/'
    } catch (err) {
      console.error('Enquiry error:', err)
      showFormError(err.message || 'Something went wrong. Please try again, or email hello@beansprout.ink directly.')
      if (btn) { btn.disabled = false; btn.textContent = label || 'Send enquiry · 🌱' }
    }
  })
}
