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

  // ── Validate everything on final submit ───────────────────────────────────
  // The form is novalidate and only the Next buttons validated steps 1-3, so the
  // required consent boxes in step 4 (age / policy / deposit) could be bypassed.
  // Re-check every step on submit; block and jump to the first incomplete one.
  document.getElementById('enquiry-form')?.addEventListener('submit', e => {
    let firstBad = null
    for (let n = 1; n <= TOTAL; n++) {
      if (!validateStep(n) && firstBad === null) firstBad = n
    }
    if (firstBad !== null) {
      e.preventDefault()
      setStep(firstBad)
      document.querySelector(`#step-${firstBad} .field.error`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      return
    }
    try { sessionStorage.removeItem('beansprout_step') } catch (_) {}
  })
}
