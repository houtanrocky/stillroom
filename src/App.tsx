import { listAttempts, saveAttempt } from './library'
import { lazy, Suspense, useEffect, useId, useMemo, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, Check, CheckCheck, ChevronDown, CircleHelp, Clock3, Copy, FileJson2, Focus, Layers2, Lightbulb, Moon, Pause, Play, Plus, RotateCcw, Sun, X, Minus } from 'lucide-react'
import { useRegisterSW } from 'virtual:pwa-register/react'
import { demoExam, parseExam, type Exam, type Question, type QuestionType } from './exam'
import MathToolbox from './MathToolbox'
import { relatednessLevels, studyInstructions, studyPurposes, type Relatedness, type StudyPurpose } from './studyPurpose'
import { buildReview, mistakeSource, questionHistory, reviewLimit, topicStatistics, type ReviewHistory } from './questionHistory'
import TopicStatistics from './TopicStatistics'

type Screen = 'library' | 'welcome' | 'run' | 'results' | 'statistics'
export type RunData = { id: string; updated: number; completed?: boolean; exam: Exam; mode: Exam['mode']; index: number; answers: Record<string, string>; responses: Record<string, string>; selfGrades: Record<string, 'met' | 'review'>; committed: string[]; hints: Record<string, number>; work: Record<string, string>; revealedChoices: string[]; explanations: Record<string, string>; seconds: number; paused: boolean; studyGuideOpen: boolean; review?: ReviewHistory }
type PromptSpec = { subject: string; goal: string; level: string; mode: Exam['mode']; style: string; hideOptionsUntilWork: boolean; includeReferences: boolean; includeStudyGuide: boolean; questionCounts: Record<QuestionType, number>; choicesPerQuestion: number }
const defaultPrompt: PromptSpec = { subject: 'Advanced linear algebra', goal: 'Test deep understanding of linear maps, canonical forms, duality, and the hypotheses behind major theorems.', level: 'Advanced graduate', mode: 'washback', style: 'Difficult but fair. Favor proof insight, counterexamples, subtle assumptions, and calculations that reveal conceptual gaps.', hideOptionsUntilWork: false, includeReferences: false, includeStudyGuide: false, questionCounts: { 'multiple-choice': 0, 'short-answer': 6, 'free-response': 0, proof: 4 }, choicesPerQuestion: 4 }
const questionType = (q: Question): QuestionType => q.type ?? (q.choices.length ? 'multiple-choice' : 'short-answer')
const SAVE_KEY = 'stillroom.active-run.v1'
const fmtTime = (n: number) => `${String(Math.floor(n / 3600)).padStart(2, '0')}:${String(Math.floor(n / 60) % 60).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`
const RichText = lazy(() => import('./RichText'))
function Content({ text, className = '' }: { text: string; className?: string }) {
  return <Suspense fallback={<div className={`rich-text ${className}`}>{text}</div>}><RichText text={text} className={className} /></Suspense>
}

function AnswerComparison({ response, model, proof }: { response: string; model: string; proof: boolean }) {
  const id = useId()
  const [compact, setCompact] = useState(() => window.matchMedia('(max-width: 650px)').matches)
  const [showModel, setShowModel] = useState(false)
  useEffect(() => {
    const media = window.matchMedia('(max-width: 650px)')
    const update = () => setCompact(media.matches)
    media.addEventListener('change', update)
    document.addEventListener('visibilitychange', update)
    return () => {
      media.removeEventListener('change', update)
      document.removeEventListener('visibilitychange', update)
    }
  }, [])
  const panels = [
    { key: 'your', label: proof ? 'Your proof' : 'Your answer', text: response },
    { key: 'model', label: proof ? 'Model proof' : 'Model answer', text: model },
  ]
  return <div className="answer-comparison">
    <div className="choice-switch comparison-switch" role="tablist" aria-label="Compare answers" onKeyDown={event => {
      const { key } = event
      if (key !== 'Home' && key !== 'End' && key !== 'ArrowLeft' && key !== 'ArrowRight') return
      const next = key !== 'Home' && (key === 'End' || !showModel)
      event.preventDefault()
      setShowModel(next)
      document.getElementById(`${id}-${next ? 'model' : 'your'}-tab`)?.focus()
    }}>
      {panels.map(({ key, label }) => <button key={key} role="tab" id={`${id}-${key}-tab`} aria-controls={`${id}-${key}-panel`}
        aria-selected={showModel === (key === 'model')} tabIndex={showModel === (key === 'model') ? 0 : -1}
        onClick={() => setShowModel(key === 'model')}>{label}</button>)}
    </div>
    <div className="comparison-columns">
      {panels.map(({ key, label, text }) => <section key={key} className="comparison-panel" id={`${id}-${key}-panel`}
        role={compact ? 'tabpanel' : undefined} aria-labelledby={compact ? `${id}-${key}-tab` : undefined}
        tabIndex={compact ? 0 : undefined} data-selected={showModel === (key === 'model')}>
        <h3>{label}</h3><Content text={text} />
      </section>)}
    </div>
  </div>
}

const reviewLabel = (count: number) => `Review ${count} ${count === 1 ? 'question' : 'questions'}`
const answeredCount = (attempt: RunData) => questionHistory([attempt]).filter(entry => entry.outcome !== 'unanswered').length

function ExplanationDocument({ raw, questionId }: { raw: string; questionId: string }) {
  try {
    const doc = JSON.parse(raw)
    if (doc.protocol !== 'stillroom.explanation.v1' || doc.questionId !== questionId || !Array.isArray(doc.blocks)) throw new Error()
    return <div className="explanation-document"><h3>{String(doc.title || 'Question explanation')}</h3>{doc.blocks.slice(0, 20).map((block: any, i: number) => block.type === 'markdown' && typeof block.content === 'string' ? <Content key={i} text={block.content} /> : block.type === 'svg' ? <SafeDiagram key={i} diagram={block} /> : null)}</div>
  } catch { return <p className="error-text">That response does not match the Stillroom explanation format. Copy a valid JSON response into the box.</p> }
}
function SafeDiagram({ diagram }: { diagram: any }) {
  const allowed = new Set(['line', 'circle', 'rect', 'path', 'text', 'polygon'])
  const attrs = ['x','y','x1','y1','x2','y2','cx','cy','r','width','height','points','d','fill','stroke','strokeWidth']
  if (typeof diagram.viewBox !== 'string' || !/^0 0 [\d.]+ [\d.]+$/.test(diagram.viewBox) || !Array.isArray(diagram.elements)) return null
  return <figure className="explanation-diagram"><figcaption>{String(diagram.title || 'Diagram')}</figcaption><svg viewBox={diagram.viewBox} role="img" aria-label={String(diagram.title || 'Explanation diagram')}>{diagram.elements.slice(0, 100).map((el: any, i: number) => { if (!allowed.has(el.shape)) return null; const props = Object.fromEntries(attrs.filter(k => el[k] !== undefined && (typeof el[k] === 'number' || (['fill','stroke','d','points'].includes(k) && typeof el[k] === 'string'))).map(k => [k, el[k]])); return el.shape === 'text' ? <text key={i} {...props}>{String(el.text || '').slice(0, 80)}</text> : el.shape === 'line' ? <line key={i} {...props} /> : el.shape === 'circle' ? <circle key={i} {...props} /> : el.shape === 'rect' ? <rect key={i} {...props} /> : el.shape === 'path' ? <path key={i} {...props} /> : <polygon key={i} {...props} /> })}</svg></figure>
}
function makePrompt(spec: PromptSpec, instructions: string) {
  const total = Object.values(spec.questionCounts).reduce((sum, count) => sum + count, 0)
  const selectedTypes = (Object.keys(spec.questionCounts) as QuestionType[]).filter(type => spec.questionCounts[type] > 0)
  const sampleQuestion = (type: QuestionType) => type === 'multiple-choice' ? {
    id: `q-${type}`, type, topic: spec.subject, difficulty: 'deep', points: 100,
    prompt: 'Write the full question here. Use Markdown and $LaTeX$ for mathematical notation.',
    choices: Array.from({ length: spec.choicesPerQuestion }, (_, i) => ({ id: String.fromCharCode(97 + i), text: `Plausible answer ${i + 1}` })),
    answer: 'a', explanation: 'Explain the reasoning step by step using LaTeX for mathematical expressions.',
    choiceExplanations: Object.fromEntries(Array.from({ length: spec.choicesPerQuestion - 1 }, (_, i) => [String.fromCharCode(98 + i), 'Explain specifically why this distractor is incorrect.'])),
    hints: spec.mode === 'washback' ? [{ label: 'Nudge', text: 'A small conceptual nudge.', cost: 12 }, { label: 'Structure', text: 'A useful theorem or intermediate step.', cost: 24 }, { label: 'Near the result', text: 'A strong final clue.', cost: 38 }] : [],
  } : {
    id: `q-${type}`, type, topic: spec.subject, difficulty: 'deep', points: 100,
    prompt: type === 'proof' ? 'Prove the stated claim, making every hypothesis and logical step explicit.' : 'Write a complete solution. Use Markdown and $LaTeX$ for mathematical notation.',
    expectedAnswer: 'Write a complete model solution here, using LaTeX for mathematical expressions.',
    rubric: 'List the mathematical steps and criteria required for full credit.',
    explanation: 'Add any further reasoning or common pitfalls.',
    hints: spec.mode === 'washback' ? [{ label: 'Nudge', text: 'A small conceptual nudge.', cost: 12 }, { label: 'Structure', text: 'A useful theorem or intermediate step.', cost: 24 }, { label: 'Near the result', text: 'A strong final clue.', cost: 38 }] : [],
  }
  const sample = {
    title: `${spec.subject}: practice set`,
    subtitle: `A focused ${spec.level.toLowerCase()} practice set.`,
    subject: spec.subject,
    mode: spec.mode,
    pointsPerQuestion: 100,
    hideOptionsUntilWork: spec.hideOptionsUntilWork,
    ...(spec.includeStudyGuide ? { studyGuide: 'A concise guide to the concepts and prerequisites needed for these questions, shown before the questions.' } : {}),
    ...(spec.includeReferences ? { readingReferences: ['Book title, chapter, and relevant section'] } : {}),
    questions: selectedTypes.map(sampleQuestion),
  }
  return [
    'You are an expert exam author and careful subject-matter reviewer.',
    'Create the requested exam and return exactly one valid JSON object matching the schema below. Output JSON only: no introduction, explanation, Markdown code fence, or trailing text.',
    instructions,
    `SUBJECT / TOPIC: ${spec.subject}`,
    `LEARNING GOAL: ${spec.goal}`,
    `LEVEL: ${spec.level}`,
    `QUESTION COUNT: exactly ${total}`,
    `EXAM MODE: ${spec.mode}`,
    `QUESTION STYLE: ${spec.style}`,
    'TOPIC LABELS: Give every question a nonempty topic string naming the concept or skill it tests. Use short, reusable labels. Reuse the same spelling and wording for the same skill across questions and retain relevant source labels when available.',
    spec.includeReferences ? 'READING REFERENCES: Include readingReferences as an array of reliable textbooks with exact chapter and section numbers relevant to this exam. Verify titles and section names; do not invent citations. This is optional supporting material, not a substitute for the questions.' : '',
    spec.includeStudyGuide ? 'STUDY GUIDE: Include studyGuide as a concise Markdown string summarizing the concepts, definitions, and prerequisite results needed to approach the questions. It will be shown to the student before the questions, and the student can navigate back and forth between it and the questions.' : '',
    `QUESTION FORMATS AND EXACT COUNTS: ${selectedTypes.map(type => `${type}: exactly ${spec.questionCounts[type]}`).join('; ')}. Produce exactly ${total} questions with those exact per-type counts. Do not replace one type with another or add extra questions. Every question must include a type field set to one of: ${selectedTypes.join(', ')}. Multiple-choice items use choices, answer, explanation, and choiceExplanations, with exactly ${spec.choicesPerQuestion} choices. Written items have no choices and use expectedAnswer and rubric. Short-answer expects a concise response; free-response expects a full explanation or derivation; proof requests a rigorous proof.\n\nCONTENT QUALITY RULES:\n- Make every question self-contained, mathematically correct, appropriate to ${spec.level}, and aligned to the stated learning goal.\n- State the correct answer or model solution first in the review. The app displays it before explanation and rubric.\n- Write all mathematical expressions in delimited LaTeX ($inline$ or $$display$$), including prompts, options, expected answers, rubrics, and distractor analysis, so formulas render on the page. Use Markdown where helpful.\n- Use unique string question IDs and unique string choice IDs within each multiple-choice question. The multiple-choice answer field must exactly equal the ID of its correct choice.\n- Match the schema exactly: exam fields title, subtitle, subject, mode, pointsPerQuestion, hideOptionsUntilWork, studyGuide, readingReferences, questions; question fields id, type, topic, difficulty, points, prompt, choices, answer, expectedAnswer, rubric, explanation, choiceExplanations, hints; choice fields id and text; hint fields label, text, and numeric cost. Omit fields that do not apply to a question type. Set hideOptionsUntilWork exactly to ${spec.hideOptionsUntilWork}; it hides choices until the learner records written work on multiple-choice items. Do not add extra fields or any prose outside the JSON.`,
    spec.mode === 'washback'
      ? 'WASHBACK RULES: Include exactly three ordered hints per question with costs 12, 24, and 38. Make each hint progressively more informative, but do not state the answer or make the question trivial before the final hint.'
      : 'FEEDBACK RULES: Set hints to an empty array for each question. Make the explanation informative enough for immediate feedback after a choice.',
    `JSON SHAPE EXAMPLES (one example for every selected type; replace sample content and produce exactly ${total} questions with the type counts above):`,
    JSON.stringify(sample, null, 2),
  ].filter(Boolean).join('\n\n')
}

export default function App() {
  const [fontScale, setFontScale] = useState(() => {
    try { return Math.max(0.9, Math.min(1.2, Number(localStorage.getItem('stillroom.fontScale')) || 1)) } catch { return 1 }
  })
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    try { return localStorage.getItem('stillroom.theme') === 'dark' ? 'dark' : 'light' } catch { return 'light' }
  })
  const [screen, setScreen] = useState<Screen>('welcome')
  const [mode, setMode] = useState<Exam['mode']>(demoExam.mode)
  const [run, setRun] = useState<RunData | null>(null)
  const [worker, setWorker] = useState<ServiceWorkerRegistration>()
  const [updating, setUpdating] = useState(false)
  const [updateError, setUpdateError] = useState('')
  const { needRefresh: [updateAvailable], updateServiceWorker } = useRegisterSW({
    immediate: true,
    onRegisteredSW: (_, registration) => setWorker(registration),
  })
  const [examFilter, setExamFilter] = useState<'all' | 'in-progress' | 'completed'>('all')
  const [error, setError] = useState('')
  const [jsonOpen, setJsonOpen] = useState(false)
  const [jsonText, setJsonText] = useState('')
  const [confirmFinish, setConfirmFinish] = useState(false)
  const [focus, setFocus] = useState(false)
  const [promptOpen, setPromptOpen] = useState(false)
  const [promptSpec, setPromptSpec] = useState<PromptSpec>({ ...defaultPrompt, subject: '', goal: '', level: '', style: '' })
  const [purpose, setPurpose] = useState<StudyPurpose>('general')
  const [sourceDrafts, setSourceDrafts] = useState<Partial<Record<StudyPurpose, string>>>({})
  const [relatedness, setRelatedness] = useState<Relatedness>('close')
  const [nextSessionClues, setNextSessionClues] = useState('')
  const [mistakeTopic, setMistakeTopic] = useState('')
  const [selectedMistakes, setSelectedMistakes] = useState<string[]>([])
  const [promptCopied, setPromptCopied] = useState(false)
  const [explainOpen, setExplainOpen] = useState(false)
  const [explainRequest, setExplainRequest] = useState('')
  const [explainCopied, setExplainCopied] = useState(false)
  const [explanationExpanded, setExplanationExpanded] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const promptRef = useRef<HTMLTextAreaElement>(null)
  const questionMapRef = useRef<HTMLDialogElement>(null)
  const finishDialogRef = useRef<HTMLDialogElement>(null)
  const questionStageRef = useRef<HTMLElement>(null)
  const answerReviewRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (confirmFinish) finishDialogRef.current?.showModal()
  }, [confirmFinish])

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#171b18' : '#f4f5f2')
    try { localStorage.setItem('stillroom.theme', theme) } catch { /* Theme still works for this session. */ }
  }, [theme])
  useEffect(() => {
    document.documentElement.style.zoom = String(fontScale)
    try { localStorage.setItem('stillroom.fontScale', String(fontScale)) } catch { /* Keep the current size for this session. */ }
  }, [fontScale])

  useEffect(() => {
    if (!worker) return
    const check = () => {
      if (document.visibilityState === 'visible' && navigator.onLine && !worker.installing) {
        void worker.update().catch(() => { /* Retry on the next check. */ })
      }
    }
    document.addEventListener('visibilitychange', check)
    window.addEventListener('online', check)
    const interval = window.setInterval(check, 30 * 60 * 1000)
    return () => {
      document.removeEventListener('visibilitychange', check)
      window.removeEventListener('online', check)
      window.clearInterval(interval)
    }
  }, [worker])

  const updateQuestionCount = (type: QuestionType, value: number) => setPromptSpec(spec => {
    const otherTotal = Object.entries(spec.questionCounts).reduce((sum, [key, count]) => sum + (key === type ? 0 : count), 0)
    const nextValue = otherTotal === 0 ? Math.max(1, value) : value
    return { ...spec, hideOptionsUntilWork: type === 'multiple-choice' && nextValue === 0 ? false : spec.hideOptionsUntilWork, questionCounts: { ...spec.questionCounts, [type]: Math.max(0, Math.min(60 - otherTotal, Number.isFinite(nextValue) ? nextValue : 1)) } }
  })

  const [library, setLibrary] = useState<RunData[]>([])
  const review = useMemo(() => screen === 'welcome' ? buildReview(library) : null, [library, screen])
  const reviewCount = review?.exam.questions.length ?? 0
  const unfinished = run && !run.completed ? run : null
  const pendingReview = unfinished?.review ? unfinished : library.find(item => item.id !== run?.id && item.review && !item.completed)
  const pendingExam = unfinished && !unfinished.review ? unfinished : library.find(item => item.id !== run?.id && !item.review && !item.completed)
  const visibleAttempts = library.filter(item => examFilter === 'all' || Boolean(item.completed) === (examFilter === 'completed'))
  const resultAttempt = screen === 'results' ? run : null
  const resultHistory = useMemo(() => resultAttempt ? questionHistory([resultAttempt]) : [], [resultAttempt])
  const resultReview = useMemo(() => resultAttempt ? buildReview([resultAttempt]) : null, [resultAttempt])
  const resultReviewCount = resultReview?.exam.questions.length ?? 0
  const history = useMemo(() => questionHistory(resultAttempt
    ? [resultAttempt, ...library.filter(item => item.id !== resultAttempt.id)]
    : library), [library, resultAttempt])
  const topics = useMemo(() => topicStatistics(history), [history])
  const mistakes = purpose === 'mistakes' ? history.filter(entry => entry.practice) : []
  const pickedMistakes = mistakes.filter(entry => selectedMistakes.includes(entry.key))
  const source = sourceDrafts[purpose] ?? ''
  const purposeDetails = studyPurposes[purpose]
  const promptReady = purpose === 'mistakes' ? pickedMistakes.length > 0 : purpose === 'general' || Boolean(source.trim())
  const prompt = promptOpen && promptReady ? makePrompt({
    ...promptSpec,
    subject: promptSpec.subject.trim() || (purpose === 'general' ? defaultPrompt.subject : 'Infer the subject from the learner material'),
    goal: promptSpec.goal.trim() || (purpose === 'general' ? defaultPrompt.goal : purposeDetails.label),
    level: promptSpec.level.trim() || (purpose === 'general' ? defaultPrompt.level : 'Match the learner material'),
    style: promptSpec.style.trim() || (purpose === 'general' ? defaultPrompt.style : 'Follow the study purpose'),
  }, studyInstructions(purpose, purpose === 'mistakes' ? mistakeSource(pickedMistakes) : source,
    relatedness, nextSessionClues, promptSpec.includeStudyGuide)) : ''

  const openMistakePractice = (topic = '', selected: string[] = []) => {
    setPurpose('mistakes')
    setMistakeTopic(topic)
    setSelectedMistakes(selected)
    setPromptCopied(false)
    setPromptOpen(true)
  }

  const copyPrompt = async () => {
    if (!prompt) return
    try {
      await navigator.clipboard.writeText(prompt)
    } catch {
      promptRef.current?.select()
      if (!document.execCommand('copy')) return
    }
    setPromptCopied(true)
    window.setTimeout(() => setPromptCopied(false), 2200)
  }

  const [ready, setReady] = useState(false)
  const [storageError, setStorageError] = useState('')
  useEffect(() => {
    let mounted = true
    async function load() {
      const raw = localStorage.getItem(SAVE_KEY)
      if (raw) {
        const saved = JSON.parse(raw)
        await saveAttempt({ answers: {}, responses: {}, selfGrades: {}, work: {}, revealedChoices: [], explanations: {}, studyGuideOpen: false, ...saved, id: 'legacy-active', updated: Date.now() })
        localStorage.removeItem(SAVE_KEY)
      }
      const attempts = await listAttempts()
      if (!mounted) return
      setLibrary(attempts)
      const latest = attempts.find(item => !item.completed)
      if (latest) { setRun(latest); setMode(latest.mode) }
      setReady(true)
    }
    load().catch(() => { if (mounted) setStorageError('Could not open the exam library. Check browser storage permissions and reload.') })
    return () => { mounted = false }
  }, [])
  useEffect(() => {
    if (!ready || !run || (screen !== 'run' && screen !== 'results')) return
    const attempt = { ...run, updated: Date.now() }
    saveAttempt(attempt).then(() => {
      setLibrary(items => [attempt, ...items.filter(item => item.id !== attempt.id)])
      setStorageError('')
    }).catch(() => setStorageError('Your latest changes could not be saved. Check available browser storage.'))
  }, [run, screen, ready])
  useEffect(() => {
    if (!run || run.paused || screen !== 'run') return
    const timer = window.setInterval(() => setRun(r => r ? { ...r, seconds: r.seconds + 1 } : r), 1000)
    return () => window.clearInterval(timer)
  }, [run?.paused, screen])

  const startWith = (selectedExam: Exam, selectedMode: Exam['mode'], review?: ReviewHistory) => {
    const active: RunData = { id: crypto.randomUUID(), updated: Date.now(), exam: selectedExam, mode: selectedMode, index: 0, answers: {}, responses: {}, selfGrades: {}, committed: [], hints: {}, work: {}, revealedChoices: [], explanations: {}, seconds: 0, paused: false, studyGuideOpen: !!(selectedExam.studyGuide || selectedExam.readingReferences?.length), review }
    setRun(active); setMode(selectedMode); setScreen('run'); setError(''); setConfirmFinish(false); setFocus(false)
    window.scrollTo(0, 0)
  }
  const resumeAttempt = (attempt: RunData) => {
    setRun(attempt); setMode(attempt.mode); setScreen('run'); setError(''); setConfirmFinish(false); setFocus(false)
    window.scrollTo(0, 0)
  }
  const updateRun = (fn: (current: RunData) => RunData) => setRun(r => r ? fn(r) : r)
  const goToQuestion = (index: number) => {
    questionMapRef.current?.close()
    updateRun(r => ({ ...r, index }))
    window.requestAnimationFrame(() => questionStageRef.current?.focus())
  }
  const goHome = () => {
    setScreen('welcome'); setFocus(false)
    window.scrollTo(0, 0)
  }
  const closeFinish = () => {
    finishDialogRef.current?.close()
    setConfirmFinish(false)
  }
  const openImport = () => { setJsonText(''); setError(''); setJsonOpen(true) }
  const applyUpdate = async () => {
    setUpdating(true)
    setUpdateError('')
    try {
      if (run && (screen === 'run' || screen === 'results')) await saveAttempt({ ...run, updated: Date.now() })
      await updateServiceWorker()
    } catch {
      setUpdating(false)
      setUpdateError('Could not apply the update. Try again.')
    }
  }
  const importJson = (raw: string) => {
    try { const parsed = parseExam(raw); setJsonText(JSON.stringify(parsed, null, 2)); setJsonOpen(false); startWith(parsed, parsed.mode) }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not read this exam JSON.') }
  }
  const score = (source: RunData) => source.exam.questions.reduce((total, q) => {
    if (!source.committed.includes(q.id) || (questionType(q) === 'multiple-choice' ? source.answers[q.id] !== q.answer : source.selfGrades[q.id] !== 'met')) return total
    const base = q.points ?? source.exam.pointsPerQuestion ?? 100
    const loss = q.hints.slice(0, source.hints[q.id] ?? 0).reduce((sum, h) => sum + h.cost, 0)
    return total + Math.max(0, base - loss)
  }, 0)
  const maxScore = run?.exam.questions.reduce((sum, q) => sum + (q.points ?? run.exam.pointsPerQuestion ?? 100), 0) ?? 0
  const submit = (q: Question, skipped = false) => {
    if (!run || run.committed.includes(q.id)) return
    if (questionType(q) !== 'multiple-choice' && !(run.responses[q.id] ?? '').trim()) return
    const committed = [...run.committed, q.id]
    setRun({ ...run, answers: skipped ? { ...run.answers, [q.id]: '' } : run.answers, committed })
    window.requestAnimationFrame(() => answerReviewRef.current?.focus())
  }
  const finish = () => {
    if (!run) return
    const committed = new Set(run.committed)
    if (run.mode === 'feedback') {
      for (const q of run.exam.questions) {
        if (q.choices.some(choice => choice.id === run.answers[q.id])) committed.add(q.id)
      }
    }
    const done = { ...run, completed: true, committed: [...committed], paused: true }
    closeFinish()
    setRun(done); setScreen('results')
    window.scrollTo(0, 0)
  }
  const current = run?.exam.questions[run.index]
  const explanationPrompt = current ? `You are a patient tutor. Help the learner understand this exact question without changing its meaning.\n\nEXAM: ${run?.exam.title ?? ''}\nSUBJECT: ${run?.exam.subject ?? ''}\nQUESTION DATA (authoritative JSON):\n${JSON.stringify(current, null, 2)}\n\nLEARNER REQUEST: ${explainRequest.trim() || 'Explain the question clearly and identify what it is asking.'}\n\nAvailable output tools: Markdown text, inline/display LaTeX, and a declarative 2D SVG drawing. Use a drawing only when it materially helps (geometry, graphs, diagrams); do not emit executable code, scripts, external URLs, or 3D. Return exactly one JSON object, no fences or extra prose, in this protocol:\n{\n  "protocol": "stillroom.explanation.v1",\n  "questionId": ${JSON.stringify(current.id)},\n  "title": "Brief heading",\n  "blocks": [\n    { "type": "markdown", "content": "Explanation using Markdown and delimited LaTeX" },\n    { "type": "svg", "title": "Diagram title", "viewBox": "0 0 400 240", "elements": [{ "shape": "line", "x1": 20, "y1": 120, "x2": 380, "y2": 120, "stroke": "#536b55", "strokeWidth": 2 }, { "shape": "circle", "cx": 200, "cy": 120, "r": 8, "fill": "#536b55" }, { "shape": "text", "x": 208, "y": 110, "text": "A", "fill": "#303a32" }] }\n  ]\n}\nUse only markdown blocks and SVG elements line, circle, rect, path, text, polygon. SVG coordinates must fit viewBox; use simple paths and short labels. Omit SVG when unnecessary. Do not reveal the answer unless the learner explicitly asks; focus on interpreting terms, givens, goals, and a first step. Do not include HTML or arbitrary SVG attributes.` : ''
  const copyExplanationPrompt = async () => { try { await navigator.clipboard.writeText(explanationPrompt) } catch { /* The prompt remains selectable in its preview. */ } setExplainCopied(true); window.setTimeout(() => setExplainCopied(false), 2200) }
  const answered = run ? answeredCount(run) : 0
  const resultSummary = [
    [resultHistory.filter(entry => entry.outcome === 'needs review').length, 'missed'],
    [resultHistory.filter(entry => entry.outcome === 'correct' && entry.hintsUsed > 0).length, 'solved with hints'],
    [resultHistory.filter(entry => entry.skipped).length, 'skipped'],
    [resultHistory.filter(entry => entry.outcome === 'ungraded').length, 'awaiting self-check'],
    [resultHistory.filter(entry => entry.outcome === 'unanswered' && !entry.skipped).length, 'unanswered'],
  ] as const
  const selected = current && run ? run.answers[current.id] : undefined
  const committed = !!current && !!run?.committed.includes(current.id)
  const previousReview = committed && current ? run?.review?.[current.id] : undefined
  const isMultipleChoice = !!current && questionType(current) === 'multiple-choice'
  const correct = !!current && (isMultipleChoice ? selected === current.answer : run?.selfGrades[current.id] === 'met')
  const choicesHidden = !!current && isMultipleChoice && !committed && !!run?.exam.hideOptionsUntilWork && !run.revealedChoices.includes(current.id)
  const correctChoice = current?.choices.find(choice => choice.id === current.answer)
  const earned = current && run && committed && correct ? Math.max(0, (current.points ?? run.exam.pointsPerQuestion ?? 100) - current.hints.slice(0, run.hints[current.id] ?? 0).reduce((s, h) => s + h.cost, 0)) : 0
  const choicesView = current && run && <div className="choices-list" role="group" aria-label="Answer choices">{current.choices.map((choice, i) => { const chosen = selected === choice.id; const reveal = committed || (run.mode === 'feedback' && chosen); const isAnswer = choice.id === current.answer; return <button key={choice.id} className={`choice ${chosen ? 'chosen' : ''} ${reveal && isAnswer ? 'correct' : ''} ${reveal && chosen && !isAnswer ? 'incorrect' : ''} ${committed ? 'locked' : ''}`} onClick={() => { if (committed) return; updateRun(r => ({ ...r, answers: { ...r.answers, [current.id]: r.answers[current.id] === choice.id && r.mode === 'washback' ? '' : choice.id } })) }} disabled={committed}><span className="choice-letter">{String.fromCharCode(65 + i)}</span><Content className="choice-text" text={choice.text} /><span className="choice-result">{reveal && isAnswer ? <Check size={16} /> : reveal && chosen ? <X size={15} /> : chosen ? <span className="radio-dot" /> : null}</span></button> })}</div>
  const choiceReview = current?.choiceExplanations && current.choices.filter(choice => choice.id !== current.answer && current.choiceExplanations?.[choice.id]).map(choice => <div className="choice-review-row" key={choice.id}><div className="choice-review-label"><span>Wrong option {String.fromCharCode(65 + current.choices.indexOf(choice))}</span><Content className="wrong-choice-value" text={choice.text} /></div><Content className="choice-review-text" text={current.choiceExplanations?.[choice.id] ?? ''} /></div>)
  const questionMap = run && <div className="question-map">{run.exam.questions.map((question, index) => {
    const active = index === run.index
    const done = run.committed.includes(question.id) || (run.mode === 'feedback' && !!run.answers[question.id])
    const skipped = done && questionType(question) === 'multiple-choice' && !run.answers[question.id]
    const isCorrect = questionType(question) === 'multiple-choice' ? run.answers[question.id] === question.answer : run.selfGrades[question.id] === 'met'
    return <button key={question.id} className={`map-item ${active ? 'current' : ''} ${done ? 'done' : ''} ${done && isCorrect ? 'map-correct' : ''}`}
      onClick={() => goToQuestion(index)} disabled={run.mode === 'washback' && !done && index > run.index}
      aria-current={active ? 'step' : undefined} aria-label={`Question ${index + 1}${question.topic ? `, ${question.topic}` : ''}${skipped ? ', skipped' : done ? ', answered' : ''}`}>
      <span className="map-num">{done && isCorrect ? <Check size={12} /> : String(index + 1)}</span>
      <span className="map-topic">{question.topic || `Question ${index + 1}`}</span>
      <span className="map-state">{active ? 'Current' : skipped ? 'Skipped' : done ? 'Done' : ''}</span>
    </button>
  })}</div>
  const hintsUsed = current && run ? run.hints[current.id] ?? 0 : 0
  const nextHint = current?.hints[hintsUsed]
  const allCommitted = !!run && run.committed.length === run.exam.questions.length
  const lastQuestion = !!run && run.index === run.exam.questions.length - 1
  const advance = () => {
    if (!run) return
    if (run.mode === 'washback' && allCommitted) finish()
    else if (lastQuestion) setConfirmFinish(true)
    else goToQuestion(run.index + 1)
  }
  const mainAction = current && run && (() => {
    if (choicesHidden) return { label: 'Reveal choices', disabled: !(run.work[current.id] ?? '').trim(), onClick: () => {
      updateRun(r => ({ ...r, revealedChoices: [...r.revealedChoices, current.id] }))
      window.requestAnimationFrame(() => questionStageRef.current?.querySelector<HTMLButtonElement>('.choice')?.focus())
    } }
    if (!committed && !isMultipleChoice) return { label: 'Submit for review', disabled: !(run.responses[current.id] ?? '').trim(), onClick: () => submit(current) }
    if (!committed && run.mode === 'washback') return { label: 'Lock in answer', disabled: !selected, onClick: () => submit(current) }
    return { label: lastQuestion || (allCommitted && run.mode === 'washback') ? 'Finish session' : 'Next question', onClick: advance }
  })()

  return <div className={`app-shell ${screen === 'run' && !run?.studyGuideOpen ? 'session-open' : ''} ${focus && screen === 'run' ? 'focus-mode' : ''}`}>
    <header className="topbar">
      <button className="brand" onClick={goHome} aria-label="Stillroom home"><span className="brand-icon" aria-hidden="true" /><span className="brand-name">stillroom<span className="brand-period">.</span></span></button>
      <div className="topbar-right">
        {screen === 'run' && !storageError && <span className="saved-state"><span />Autosaved</span>}
        <div className="font-controls" role="group" aria-label="Reading size">
          <button className="icon-button" title="Decrease font size" aria-label="Decrease font size" disabled={fontScale <= 0.9} onClick={() => setFontScale(size => Math.max(0.9, Math.round((size - 0.1) * 10) / 10))}><Minus size={14} /></button>
          <button className="icon-button" title="Increase font size" aria-label="Increase font size" disabled={fontScale >= 1.2} onClick={() => setFontScale(size => Math.min(1.2, Math.round((size + 0.1) * 10) / 10))}><Plus size={14} /></button>
        </div>
        <button className="icon-button" title="Exam JSON format" aria-label="Exam JSON format" onClick={() => setJsonOpen(true)}><CircleHelp size={17} strokeWidth={1.7} /></button>
        <button className="icon-button theme-toggle" title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`} aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`} onClick={() => setTheme(current => current === 'light' ? 'dark' : 'light')}>{theme === 'light' ? <Moon size={16} /> : <Sun size={16} />}</button>
        <div className="topbar-navigation">
          <MathToolbox />
          <button className="secondary-button library-link" onClick={() => setScreen('library')}>Exams</button>
        </div>
      </div>
    </header>

    {storageError && <p role="alert" className="storage-alert">{storageError}</p>}
    {updateAvailable && <div className="app-update">
      <p role="status">{updateError || 'A Stillroom update is ready.'}</p>
      <button className="secondary-button" onClick={applyUpdate} disabled={updating}>{updating ? 'Updating…' : 'Update and reopen'}</button>
    </div>}
    {screen === 'statistics' && <TopicStatistics topics={topics} ready={ready} onBack={() => setScreen('library')} onPractice={openMistakePractice} />}
    {screen === 'library' && <main className="exam-library">
      <button className="back-link" onClick={goHome}><ArrowLeft size={15} /> Home</button>
      <h1>Your exams</h1>
      <div className="library-tools">
      <button className="primary-button" disabled={!ready} onClick={openImport}>Import JSON</button>
      <button className="secondary-button" onClick={() => setScreen('statistics')}>Topic statistics</button>
      <details className="library-backup"><summary>Backup</summary>
      <div className="library-backup-actions">
      <button className="secondary-button" disabled={!library.length} onClick={() => {
        const url = URL.createObjectURL(new Blob([JSON.stringify({ format: 'stillroom-library-v1', attempts: library })], { type: 'application/json' }))
        const link = document.createElement('a')
        link.href = url
        link.download = 'stillroom-library.json'
        link.click()
        setTimeout(() => URL.revokeObjectURL(url), 1000)
      }}>Download backup</button>
      <label className="backup-input">Restore backup <input type="file" accept=".json" disabled={!ready} onChange={async event => {
        const file = event.target.files?.[0]
        event.target.value = ''
        if (!file) return
        try {
          const backup = JSON.parse(await file.text())
          if (backup.format !== 'stillroom-library-v1' || !Array.isArray(backup.attempts)) throw Error()
          const attempts = backup.attempts.map((item: RunData) => {
            const exam = parseExam(JSON.stringify(item.exam))
            const maps = [item.answers, item.responses, item.explanations, item.selfGrades, item.hints, item.work]
            if (!maps.every(map => map && typeof map === 'object' && !Array.isArray(map)) ||
                !Array.isArray(item.committed) || !Array.isArray(item.revealedChoices) ||
                !Number.isInteger(item.index) || !exam.questions[item.index] || typeof item.id !== 'string' ||
                !Number.isFinite(item.updated) || !Number.isFinite(item.seconds)) throw Error()
            return { ...item, exam }
          })
          const existing = new Set((await listAttempts()).map(item => item.id))
          for (const attempt of attempts) {
            if (!existing.has(attempt.id)) await saveAttempt(attempt)
          }
          setLibrary(await listAttempts())
          setStorageError('')
        } catch { setStorageError('Could not restore this backup. Choose a Stillroom library backup and check available storage.') }
      }} /></label>
      </div></details></div>
      {library.length > 0 && <div className="choice-switch library-filters" role="group" aria-label="Filter exams">
        <button aria-pressed={examFilter === 'all'} onClick={() => setExamFilter('all')}>All</button>
        <button aria-pressed={examFilter === 'in-progress'} onClick={() => setExamFilter('in-progress')}>In progress</button>
        <button aria-pressed={examFilter === 'completed'} onClick={() => setExamFilter('completed')}>Completed</button>
      </div>}
      {visibleAttempts.length === 0 && <p role="status">{!ready ? 'Loading exams…' : examFilter === 'in-progress' ? 'No exams in progress.' : examFilter === 'completed' ? 'No completed exams yet.' : 'Your exams will appear here when you start practicing.'}</p>}
      {visibleAttempts.map(item => <article key={item.id}>
        <h2>{item.exam.title}</h2>
        <p className="attempt-meta">{item.completed ? 'Completed' : 'In progress'} · {answeredCount(item)} of {item.exam.questions.length} answered · {new Date(item.updated).toLocaleDateString()}</p>
        {item.completed && <details><summary>Review answers</summary>{item.exam.questions.map(q => <section key={q.id}>
          <Content text={q.prompt} /><h3>Your answer</h3><Content text={item.responses[q.id] || q.choices.find(c => c.id === item.answers[q.id])?.text || 'Unanswered'} />
          <h3>Model answer</h3><Content text={q.expectedAnswer || q.choices.find(c => c.id === q.answer)?.text || ''} />
          {q.rubric && <><h3>Grading rubric</h3><Content text={q.rubric} /></>}
          {item.explanations[q.id] && <ExplanationDocument raw={item.explanations[q.id]} questionId={q.id} />}
        </section>)}</details>}
        <button className="secondary-button" onClick={() => {
          if (item.completed) startWith(item.exam, item.mode, item.review)
          else resumeAttempt(item)
        }}>{item.completed ? 'Practice again' : 'Resume attempt'}</button>
      </article>)}
    </main>}
    {screen === 'welcome' && ready && <main className="study-home">
      <h1>Study</h1>
      <div className="home-sessions">
        {pendingExam && <section className="home-session">
          <div><h2>{pendingExam.exam.title}</h2><p>{answeredCount(pendingExam)} of {pendingExam.exam.questions.length} answered</p></div>
          <button className="primary-button" onClick={() => resumeAttempt(pendingExam)}>Continue session <ArrowRight size={16} /></button>
        </section>}
        <section className="home-session">
          <div><h2>Question review</h2><p>{pendingReview
            ? `${answeredCount(pendingReview)} of ${pendingReview.exam.questions.length} answered`
            : reviewCount ? 'Retry questions from past sessions.' : 'Questions you miss, skip, or use hints on will appear here.'}</p></div>
          <button className={pendingExam || (!pendingReview && !reviewCount) ? 'secondary-button' : 'primary-button'} disabled={!pendingReview && !reviewCount} onClick={() => {
            if (pendingReview) resumeAttempt(pendingReview)
            else if (review && reviewCount) startWith(review.exam, review.exam.mode, review.previous)
          }}>{pendingReview ? 'Continue review' : reviewLabel(reviewCount || reviewLimit)} <ArrowRight size={16} /></button>
        </section>
      </div>
      <section className="home-new-exam">
        <h2>New exam</h2>
        <div className="home-new-actions">
          <button className={pendingExam || pendingReview || reviewCount ? 'secondary-button' : 'primary-button'} onClick={() => setPromptOpen(true)}>Build an exam prompt</button>
          <button className="secondary-button" onClick={openImport}>Import JSON</button>
          <button className="back-link sample-link" onClick={() => startWith(demoExam, mode)}>Try the sample exam</button>
        </div>
        <details className="home-options">
          <summary>Session options</summary>
          <div className="choice-switch" role="group" aria-label="Exam mode">
            <button aria-pressed={mode === 'washback'} onClick={() => setMode('washback')}>Washback</button>
            <button aria-pressed={mode === 'feedback'} onClick={() => setMode('feedback')}>Feedback</button>
          </div>
          <p>{mode === 'washback' ? 'Submit each answer to see its explanation. Hints cost points.' : 'Check answers as you go and move between questions freely.'}</p>
          {pendingExam && <div className="home-new-actions"><button className="secondary-button" onClick={() => startWith(pendingExam.exam, mode)}>Start a fresh attempt</button></div>}
        </details>
      </section>
    </main>}

    {screen === 'run' && run && current && <main className="run-page"><div className="run-heading"><button className="back-link" onClick={goHome}><ArrowLeft size={15} /> Leave session</button><div className="run-title-wrap"><span className="run-subject">{run.exam.subject || 'Independent study'} <span>—</span> {run.mode === 'washback' ? 'Washback' : 'Feedback'}</span><h1>{run.exam.title}</h1></div><div className="run-heading-right"><div className="score-chip"><span>POINTS</span><b>{score(run)}<i> / {maxScore}</i></b></div><button className={`focus-button ${focus ? 'selected' : ''}`} onClick={() => setFocus(f => !f)}><Focus size={15} /> {focus ? 'Exit focus' : 'Focus mode'}</button></div></div>
      {run.studyGuideOpen && <section className="study-guide-panel"><h2>Study notes</h2>{run.exam.studyGuide && <Content className="study-guide-content" text={run.exam.studyGuide} />}{run.exam.readingReferences?.length ? <div><h3>Suggested reading</h3><ul>{run.exam.readingReferences.map((item, i) => <li key={i}><Content text={item} /></li>)}</ul></div> : null}<button className="primary-button" onClick={() => updateRun(r => ({...r, studyGuideOpen:false}))}>Go to questions <ArrowRight size={15}/></button></section>}<div className="run-guide-toggle" style={{display:run.exam.studyGuide || run.exam.readingReferences?.length ? undefined : "none"}}><button className="secondary-button" onClick={() => updateRun(r => ({...r, studyGuideOpen:true}))}>Study notes and reading</button></div><div className="run-layout" style={{display:run.studyGuideOpen?"none":undefined}}><aside className="study-rail"><div className="rail-section rail-progress"><div className="rail-label">Answered <span>{answered} / {run.exam.questions.length}</span></div><div className="progress-track"><i style={{ width: `${answered / run.exam.questions.length * 100}%` }} /></div>{questionMap}</div>
        <div className="rail-section rail-tools"><div className="rail-label">SESSION</div><div className="clock"><Clock3 size={14} /><span>{fmtTime(run.seconds)}</span><button title={run.paused ? 'Resume timer' : 'Pause timer'} onClick={() => updateRun(r => ({ ...r, paused: !r.paused }))}>{run.paused ? <Play size={13} /> : <Pause size={13} />}</button></div></div>
        <div className="rail-bottom"><button className="finish-link" onClick={() => setConfirmFinish(true)}>Finish session <ArrowRight size={14} /></button></div></aside>
        <section className="question-stage" key={current.id} ref={questionStageRef} tabIndex={-1} aria-label={`Question ${run.index + 1}`}>
          <div className="question-topline"><div className="question-number">Question <b>{run.index + 1}</b><span> / {run.exam.questions.length}</span></div><div className="question-tags"><span className="topic-tag">{{'multiple-choice':'Multiple choice','short-answer':'Short answer','free-response':'Written response','proof':'Proof'}[questionType(current)]}</span>{current.topic && <span className="topic-tag">{current.topic}</span>}{current.difficulty && <span className={`difficulty ${current.difficulty}`}>{current.difficulty}</span>}</div></div>
          <div className="question-body"><Content className="question-prompt" text={current.prompt} />
          <div className="explain-more"><button className="secondary-button" onClick={() => { setExplainRequest(''); setExplainOpen(true) }}><CircleHelp size={14} /> {run.explanations?.[current.id] ? 'Ask for another explanation' : 'Explain more'}</button>{run.explanations?.[current.id] && <section className={`saved-explanation ${explanationExpanded ? 'expanded' : ''}`}><button className="saved-explanation-toggle" aria-expanded={explanationExpanded} onClick={() => setExplanationExpanded(value => !value)}><span><b>Question explanation</b><small>{explanationExpanded ? 'Hide explanation' : 'Show saved explanation'}</small></span><ChevronDown size={18} aria-hidden="true" /></button><div className="saved-explanation-content" hidden={!explanationExpanded}><ExplanationDocument raw={run.explanations[current.id]} questionId={current.id} /></div></section>}</div>
          {isMultipleChoice ? choicesHidden ? <section className="written-response">
            <label htmlFor={`work-${current.id}`}>Your work</label>
            <small className="response-guidance">Write a result before revealing the answer choices.</small>
            <textarea id={`work-${current.id}`} value={run.work[current.id] ?? ''} onChange={e => updateRun(r => ({ ...r, work: { ...r.work, [current.id]: e.target.value } }))} />
          </section> : <>
            {run.exam.hideOptionsUntilWork && run.work[current.id] && <div className="work-note"><span>Your work</span><Content className="work-note-content" text={run.work[current.id]} /></div>}
            {choicesView}
          </> : !committed && <section className={`written-response written-${questionType(current)}`}>
            <label htmlFor={`response-${current.id}`}>Your {questionType(current) === 'proof' ? 'proof' : 'answer'}</label>
            <textarea id={`response-${current.id}`} value={run.responses[current.id] ?? ''} onChange={e => updateRun(r => ({ ...r, responses: { ...r.responses, [current.id]: e.target.value } }))} />
          </section>}
          {run.mode === 'washback' && (hintsUsed > 0 || (!committed && nextHint)) && <div className="session-hints">
            <div aria-live="polite">{hintsUsed > 0 && <ol aria-label="Revealed hints">
              {current.hints.slice(0, hintsUsed).map((hint, index) => <li key={index}>
                <b>{hint.label || `Hint ${index + 1}`}</b><Content text={hint.text} />
              </li>)}
            </ol>}</div>
            {!committed && nextHint && <button className="secondary-button" onClick={() => updateRun(r =>
              (r.hints[current.id] ?? 0) === hintsUsed ? { ...r, hints: { ...r.hints, [current.id]: hintsUsed + 1 } } : r
            )}><Lightbulb size={15} /> {hintsUsed ? 'Show next hint' : 'Show hint'} · {nextHint.cost} {nextHint.cost === 1 ? 'point' : 'points'}</button>}
          </div>}
          {committed && <div ref={answerReviewRef} tabIndex={-1} role="region" aria-label="Answer review" className={`answer-review ${correct ? 'review-correct' : 'review-wrong'}`}>
            {isMultipleChoice ? <>
              <div className="review-heading">{correct ? <><CheckCheck size={16} /> Correct · {earned} points</> : <><X size={15} /> {selected ? 'Incorrect' : 'Skipped'}</>}</div>
              <div className="review-answer"><span>Correct answer</span><Content className="correct-answer-value" text={correctChoice?.text ?? ''} /></div>
            </> : <>
              <AnswerComparison response={run.responses[current.id] ?? ''} model={current.expectedAnswer ?? ''} proof={questionType(current) === 'proof'} />
              {current.rubric && <div className="rubric-review">
                <b>Grading rubric</b><Content className="explanation-rich" text={current.rubric} />
                <div className="self-grade" role="group" aria-label="Self-check">
                  <button aria-pressed={run.selfGrades[current.id] === 'met'} className={run.selfGrades[current.id] === 'met' ? 'selected' : ''} onClick={() => updateRun(r => ({ ...r, selfGrades: { ...r.selfGrades, [current.id]: 'met' } }))}>I met the rubric</button>
                  <button aria-pressed={run.selfGrades[current.id] === 'review'} className={run.selfGrades[current.id] === 'review' ? 'selected' : ''} onClick={() => updateRun(r => ({ ...r, selfGrades: { ...r.selfGrades, [current.id]: 'review' } }))}>Needs more work</button>
                  {correct && <span>{earned} points</span>}
                </div>
              </div>}
            </>}
            {current.explanation && <Content className="explanation-rich" text={current.explanation} />}
            {choiceReview && <div className="choice-review"><h3>Why the other choices are wrong</h3>{choiceReview}</div>}
          </div>}
          {run.mode === 'feedback' && isMultipleChoice && selected && !committed && <div className={`answer-review ${correct ? 'review-correct' : 'review-wrong'}`}><div className="review-heading">{correct ? <><CheckCheck size={16} /> Correct</> : <><X size={15} /> Take another look</>}</div><div className="review-answer"><span>Correct answer</span><Content className="correct-answer-value" text={correctChoice?.text ?? ''} /></div>{current.explanation && <Content className="explanation-rich" text={current.explanation} />}{choiceReview && <div className="choice-review"><h3>Why the other choices are wrong</h3>{choiceReview}</div>}</div>}
          {typeof previousReview?.answer === 'string' && previousReview.answer.trim() && <div className="work-note"><span>Previous answer</span><Content className="work-note-content" text={previousReview.answer} /></div>}
          {typeof previousReview?.work === 'string' && previousReview.work.trim() && <div className="work-note"><span>Previous work</span><Content className="work-note-content" text={previousReview.work} /></div>}
          </div>
          <div className="question-footer">
            <button className="secondary-button mobile-question-count" aria-haspopup="dialog" onClick={() => questionMapRef.current?.showModal()} aria-label={`Open question map, question ${run.index + 1} of ${run.exam.questions.length}`}>
              {run.index + 1} of {run.exam.questions.length}
            </button>
            <div className="question-actions">
              {isMultipleChoice && !committed && (run.mode === 'washback' || choicesHidden) && <button className="action-button text-action" onClick={() => run.mode === 'washback' ? submit(current, true) : advance()}>Skip</button>}
              {mainAction && <button className="action-button primary" disabled={mainAction.disabled} onClick={mainAction.onClick}>{mainAction.label} <ArrowRight size={15} /></button>}
            </div>
          </div>
        </section>
      </div>
      <dialog className="question-map-dialog" ref={questionMapRef} aria-labelledby="question-map-title">
        <div className="question-map-heading">
          <h2 id="question-map-title">Questions</h2>
          <button className="icon-button" aria-label="Close question map" onClick={() => questionMapRef.current?.close()}><X size={17} /></button>
        </div>
        {questionMap}
        <button className="secondary-button" onClick={() => { questionMapRef.current?.close(); setConfirmFinish(true) }}>Finish session</button>
      </dialog>
    </main>}

    {screen === 'results' && run && <main className="results-page">
      <h1>Session results</h1>
      <p className="result-subtitle">{run.exam.title} · {fmtTime(run.seconds)}</p>
      <div className="result-score">
        <span>Score</span><b>{score(run)}<i> / {maxScore}</i></b>
        <div className="result-bar"><i style={{ width: `${maxScore ? score(run) / maxScore * 100 : 0}%` }} /></div>
        <small>{resultHistory.filter(entry => entry.outcome === 'correct').length} of {run.exam.questions.length} correct</small>
        {resultSummary.some(([count]) => count > 0) && <p className="result-breakdown">{resultSummary.filter(([count]) => count > 0).map(([count, label]) => `${count} ${label}`).join(' · ')}</p>}
      </div>
      <div className="result-actions">
        {resultReview && resultReviewCount > 0 && <button className="primary-button" onClick={() => startWith(resultReview.exam, resultReview.exam.mode, resultReview.previous)}>{reviewLabel(resultReviewCount)} <ArrowRight size={16} /></button>}
        <button className={resultReviewCount ? 'secondary-button' : 'primary-button'} onClick={() => startWith(run.exam, run.mode, run.review)}><RotateCcw size={15} /> Try this set again</button>
        {resultReviewCount > 0 && <button className="secondary-button" onClick={() => openMistakePractice('', resultHistory.filter(entry => entry.practice).map(entry => entry.key))}>Practice from mistakes</button>}
        <button className="secondary-button" onClick={goHome}>Home</button>
      </div>
    </main>}

    {jsonOpen && <div className="modal-backdrop" onClick={() => setJsonOpen(false)}><section className="json-modal" role="dialog" aria-modal="true" aria-labelledby="import-title" onClick={e => e.stopPropagation()}><div className="modal-heading"><h2 id="import-title">Import an exam</h2><button className="icon-button" onClick={() => setJsonOpen(false)} aria-label="Close"><X size={17} /></button></div><p className="modal-copy">Choose a JSON file or paste the exam below.</p><button className="file-drop" onClick={() => fileRef.current?.click()}><FileJson2 size={19} /><span><b>Choose a JSON file</b><small>.json — stays on your device</small></span><ArrowRight size={15} /></button><input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={async e => { const file = e.target.files?.[0]; if (file) importJson(await file.text()) }} /><div className="textarea-label">OR PASTE JSON</div><textarea value={jsonText} onChange={e => setJsonText(e.target.value)} placeholder="Paste your exam JSON here—" spellCheck={false} /><div className="modal-bottom">{error && <span className="error-text">{error}</span>}<button className="primary-button" onClick={() => importJson(jsonText)} disabled={!jsonText.trim()}>Use and start exam <ArrowRight size={15} /></button></div><button className="format-link" onClick={() => setJsonText(JSON.stringify(demoExam, null, 2))}>View a complete example format</button></section></div>}

    {promptOpen && <div className="modal-backdrop exam-prompt-backdrop" onClick={() => setPromptOpen(false)}><section className="prompt-modal exam-prompt-modal" role="dialog" aria-modal="true" aria-labelledby="prompt-title" onClick={e => e.stopPropagation()}><div className="modal-heading"><h2 id="prompt-title">Build an exam prompt</h2><button className="icon-button" onClick={() => setPromptOpen(false)} aria-label="Close"><X size={17} /></button></div><div className="exam-prompt-body"><p className="modal-copy">Copy the prompt into your AI tool, then import the exam JSON it returns.</p><div className="prompt-fields">
      <label className="prompt-style">Study purpose
        <select value={purpose} onChange={e => { setPurpose(e.target.value as StudyPurpose); setPromptCopied(false) }}>
          {Object.entries(studyPurposes).map(([value, { label }]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </label>
      {'sourceLabel' in purposeDetails && <label className="prompt-style">{purposeDetails.sourceLabel} (required)
        <textarea rows={4} value={source} required placeholder={purposeDetails.placeholder} onChange={e => {
          const value = e.target.value
          setSourceDrafts(drafts => ({ ...drafts, [purpose]: value }))
          setPromptCopied(false)
        }} />
      </label>}
      {purpose === 'mistakes' && <fieldset className="prompt-style mistake-picker">
        <legend>Questions to revisit</legend>
        <label>Filter by topic
          <select value={mistakeTopic} onChange={event => setMistakeTopic(event.target.value)}>
            <option value="">All topics</option>
            {topics.filter(item => item.practice > 0).map(item => <option key={item.key} value={item.key}>{item.topic}</option>)}
          </select>
        </label>
        <p>{mistakes.length ? `${pickedMistakes.length} selected. The prompt includes their questions, answers, and written work.` : 'Questions you missed, skipped, or used hints on will appear here.'}</p>
        <div className="mistake-options">
          {mistakes.filter(entry => !mistakeTopic || entry.topicKey === mistakeTopic).map(entry => {
            const summary = entry.question.prompt.replace(/\s+/g, ' ')
            return <label key={entry.key}>
              <input type="checkbox" checked={selectedMistakes.includes(entry.key)} onChange={event => {
                const checked = event.target.checked
                setSelectedMistakes(keys => checked ? [...keys, entry.key] : keys.filter(key => key !== entry.key))
                setPromptCopied(false)
              }} />
              <span>
                <b>{entry.topic}</b> · {entry.skipped ? 'Skipped' : entry.outcome === 'needs review' ? 'Needs review' : 'Used hints'} · {entry.examTitle}
                <span className="mistake-question">{summary.length > 160 ? `${summary.slice(0, 157)}…` : summary}</span>
              </span>
            </label>
          })}
        </div>
      </fieldset>}
      {purpose === 'examples' && <label className="prompt-style">How closely should questions match?
        <select value={relatedness} onChange={e => { setRelatedness(e.target.value as Relatedness); setPromptCopied(false) }}>
          {Object.entries(relatednessLevels).map(([value, { label }]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </label>}
      {purpose === 'preview' && <label className="prompt-style">Clues about the next session (optional)
        <textarea rows={2} value={nextSessionClues} placeholder="Paste a syllabus excerpt or an upcoming topic." onChange={e => {
          setNextSessionClues(e.target.value)
          setPromptCopied(false)
        }} />
      </label>}
      <label>Subject or topic<input value={promptSpec.subject} onChange={e => setPromptSpec(s => ({ ...s, subject: e.target.value }))} placeholder={purpose === 'general' ? defaultPrompt.subject : 'Infer from your material'} /></label><label>Learning goal<textarea rows={2} placeholder={purpose === 'general' ? defaultPrompt.goal : 'Optional focus for this set'} value={promptSpec.goal} onChange={e => setPromptSpec(s => ({ ...s, goal: e.target.value }))} /></label><label>Level<input placeholder={purpose === 'general' ? defaultPrompt.level : 'Match your material'} value={promptSpec.level} onChange={e => setPromptSpec(s => ({ ...s, level: e.target.value }))} /></label><div className="prompt-counts"><span>Questions by type <small>{Object.values(promptSpec.questionCounts).reduce((sum, value) => sum + value, 0)} total · maximum 60</small></span><div className="prompt-count-grid">{([ ["multiple-choice", "Multiple choice"], ["short-answer", "Short answer"], ["free-response", "Written response"], ["proof", "Proof"] ] as [QuestionType, string][]).map(([type, label]) => <label key={type}><span>{label}</span><input aria-label={`${label} question count`} type="number" min={0} max={60} value={promptSpec.questionCounts[type]} onChange={e => updateQuestionCount(type, Number(e.target.value))} /></label>)}</div></div><label>Exam mode<select value={promptSpec.mode} onChange={e => setPromptSpec(s => ({ ...s, mode: e.target.value as Exam['mode'] }))}><option value="washback">Washback — one at a time, hints cost points</option><option value="feedback">Feedback — explore and revise answers</option></select></label>{promptSpec.questionCounts['multiple-choice'] > 0 && <label>Options per multiple-choice question<input type="number" min={2} max={8} value={promptSpec.choicesPerQuestion} onChange={e => setPromptSpec(s => ({ ...s, choicesPerQuestion: Math.max(2, Math.min(8, Number(e.target.value) || 2)) }))} /></label>}<label className="prompt-style">Question style<textarea rows={2} placeholder={purpose === 'general' ? defaultPrompt.style : 'Optional style preferences'} value={promptSpec.style} onChange={e => setPromptSpec(s => ({ ...s, style: e.target.value }))} /></label><label className="prompt-check"><input type="checkbox" checked={promptSpec.hideOptionsUntilWork} disabled={promptSpec.questionCounts["multiple-choice"] === 0} onChange={e => setPromptSpec(s => ({ ...s, hideOptionsUntilWork: e.target.checked }))} /><span><b>Solve before seeing choices</b><small>Ask me to write my result before revealing multiple-choice options.</small></span></label><label className="prompt-check"><input type="checkbox" checked={promptSpec.includeReferences} onChange={e => setPromptSpec(s => ({ ...s, includeReferences: e.target.checked }))} /><span><b>Suggest books and chapters</b><small>Include relevant textbook chapters and sections.</small></span></label><label className="prompt-check"><input type="checkbox" checked={promptSpec.includeStudyGuide} onChange={e => setPromptSpec(s => ({ ...s, includeStudyGuide: e.target.checked }))} /><span><b>Include a short study guide</b><small>Show notes before questions and allow switching between them.</small></span></label></div><div className="prompt-preview-head"><span className="textarea-label">LIVE PROMPT PREVIEW</span></div><textarea ref={promptRef} className="prompt-preview" aria-label="Live prompt preview" value={prompt} placeholder="Add the required material to see your prompt." readOnly spellCheck={false} onFocus={e => e.currentTarget.select()} /></div><div className="prompt-actions"><button className="secondary-button" onClick={() => { setPromptOpen(false); setJsonText(''); setJsonOpen(true); setError('') }}><FileJson2 size={14} /> I have the JSON</button><button className="primary-button" onClick={copyPrompt} disabled={!promptReady}><Copy size={14} /> {promptCopied ? 'Copied — paste into your LLM' : 'Copy prompt'}</button></div></section></div>}

    {explainOpen && current && <div className="modal-backdrop" onClick={() => setExplainOpen(false)}><section className="prompt-modal" role="dialog" aria-modal="true" aria-labelledby="explain-title" onClick={e => e.stopPropagation()}><div className="modal-heading"><h2 id="explain-title">Explain this question</h2><button className="icon-button" onClick={() => setExplainOpen(false)} aria-label="Close"><X size={17} /></button></div><p className="modal-copy">Copy the prompt into your AI tool and paste the JSON response below.</p><label className="explain-request-label">What would you like explained?<textarea className="explain-request" rows={3} value={explainRequest} onChange={e => setExplainRequest(e.target.value)} placeholder="For example: What does invariant complement mean here?" /></label><div className="prompt-preview-head"><span className="textarea-label">PROMPT PREVIEW</span></div><textarea className="prompt-preview" readOnly value={explanationPrompt} onFocus={e => e.currentTarget.select()} /><label className="explain-response-label" htmlFor="explanation-json">JSON response</label><textarea id="explanation-json" className="explain-response" value={run.explanations?.[current.id] ?? ''} onChange={e => updateRun(r => ({ ...r, explanations: { ...r.explanations, [current.id]: e.target.value } }))} placeholder={'Paste JSON using protocol "stillroom.explanation.v1"'} spellCheck={false} /><div className="prompt-actions"><button className="secondary-button" onClick={copyExplanationPrompt}><Copy size={14} /> {explainCopied ? 'Copied' : 'Copy prompt'}</button><button className="primary-button" onClick={() => setExplainOpen(false)}>Save explanation <Check size={14} /></button></div></section></div>}

    {confirmFinish && <dialog className="confirm-modal" ref={finishDialogRef} aria-labelledby="finish-title" onCancel={event => { event.preventDefault(); closeFinish() }}>
      <h2 id="finish-title">Finish this session?</h2><p>{answered} of {run?.exam.questions.length} answered.</p>
      <div className="confirm-actions"><button className="secondary-button" autoFocus onClick={closeFinish}>Keep going</button><button className="primary-button" onClick={finish}>Finish session <ArrowRight size={15} /></button></div>
    </dialog>}
  </div>
}

