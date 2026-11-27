import { listAttempts, saveAttempt } from './library'
import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, Check, CheckCheck, ChevronDown, CircleHelp, Clock3, Copy, FileJson2, Focus, Layers2, Lightbulb, LockKeyhole, Moon, Pause, Play, Plus, RotateCcw, Sparkles, Sun, X, Minus } from 'lucide-react'
import { demoExam, parseExam, type Exam, type Question, type QuestionType } from './exam'
import MathToolbox from './MathToolbox'
import { relatednessLevels, studyInstructions, studyPurposes, type Relatedness, type StudyPurpose } from './studyPurpose'

type Screen = 'library' | 'welcome' | 'run' | 'results'
export type RunData = { id: string; updated: number; completed?: boolean; exam: Exam; mode: Exam['mode']; index: number; answers: Record<string, string>; responses: Record<string, string>; selfGrades: Record<string, 'met' | 'review'>; committed: string[]; hints: Record<string, number>; work: Record<string, string>; revealedChoices: string[]; explanations: Record<string, string>; seconds: number; paused: boolean; studyGuideOpen: boolean }
type PromptSpec = { subject: string; goal: string; level: string; mode: Exam['mode']; style: string; hideOptionsUntilWork: boolean; includeReferences: boolean; includeStudyGuide: boolean; questionCounts: Record<QuestionType, number>; choicesPerQuestion: number }
const defaultPrompt: PromptSpec = { subject: 'Advanced linear algebra', goal: 'Test deep understanding of linear maps, canonical forms, duality, and the hypotheses behind major theorems.', level: 'Advanced graduate', mode: 'washback', style: 'Difficult but fair. Favor proof insight, counterexamples, subtle assumptions, and calculations that reveal conceptual gaps.', hideOptionsUntilWork: false, includeReferences: false, includeStudyGuide: false, questionCounts: { 'multiple-choice': 0, 'short-answer': 6, 'free-response': 0, proof: 4 }, choicesPerQuestion: 4 }
const questionType = (q: Question): QuestionType => q.type ?? (q.choices.length ? 'multiple-choice' : 'short-answer')
const SAVE_KEY = 'stillroom.active-run.v1'
const fmtTime = (n: number) => `${String(Math.floor(n / 3600)).padStart(2, '0')}:${String(Math.floor(n / 60) % 60).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`
const RichText = lazy(() => import('./RichText'))
function Content({ text, className = '' }: { text: string; className?: string }) {
  return <Suspense fallback={<div className={`rich-text ${className}`}>{text}</div>}><RichText text={text} className={className} /></Suspense>
}
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
  const [exam, setExam] = useState<Exam>(demoExam)
  const [mode, setMode] = useState<Exam['mode']>(demoExam.mode)
  const [run, setRun] = useState<RunData | null>(null)
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
  const [promptCopied, setPromptCopied] = useState(false)
  const [explainOpen, setExplainOpen] = useState(false)
  const [explainRequest, setExplainRequest] = useState('')
  const [explainCopied, setExplainCopied] = useState(false)
  const [explanationExpanded, setExplanationExpanded] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const promptRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#171b18' : '#f4f5f2')
    try { localStorage.setItem('stillroom.theme', theme) } catch { /* Theme still works for this session. */ }
  }, [theme])
  useEffect(() => {
    document.documentElement.style.zoom = String(fontScale)
    try { localStorage.setItem('stillroom.fontScale', String(fontScale)) } catch { /* Keep the current size for this session. */ }
  }, [fontScale])

  const updateQuestionCount = (type: QuestionType, value: number) => setPromptSpec(spec => {
    const otherTotal = Object.entries(spec.questionCounts).reduce((sum, [key, count]) => sum + (key === type ? 0 : count), 0)
    const nextValue = otherTotal === 0 ? Math.max(1, value) : value
    return { ...spec, hideOptionsUntilWork: type === 'multiple-choice' && nextValue === 0 ? false : spec.hideOptionsUntilWork, questionCounts: { ...spec.questionCounts, [type]: Math.max(0, Math.min(60 - otherTotal, Number.isFinite(nextValue) ? nextValue : 1)) } }
  })

  const source = sourceDrafts[purpose] ?? ''
  const purposeDetails = studyPurposes[purpose]
  const promptReady = purpose === 'general' || Boolean(source.trim())
  const prompt = promptOpen && promptReady ? makePrompt({
    ...promptSpec,
    subject: promptSpec.subject.trim() || (purpose === 'general' ? defaultPrompt.subject : 'Infer the subject from the learner material'),
    goal: promptSpec.goal.trim() || (purpose === 'general' ? defaultPrompt.goal : purposeDetails.label),
    level: promptSpec.level.trim() || (purpose === 'general' ? defaultPrompt.level : 'Match the learner material'),
    style: promptSpec.style.trim() || (purpose === 'general' ? defaultPrompt.style : 'Follow the study purpose'),
  }, studyInstructions(purpose, source, relatedness, nextSessionClues, promptSpec.includeStudyGuide)) : ''

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

  const [library, setLibrary] = useState<RunData[]>([])
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
      if (latest) { setRun(latest); setExam(latest.exam); setMode(latest.mode) }
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

  const startWith = (selectedExam: Exam, selectedMode: Exam['mode']) => {
    const active: RunData = { id: crypto.randomUUID(), updated: Date.now(), exam: selectedExam, mode: selectedMode, index: 0, answers: {}, responses: {}, selfGrades: {}, committed: [], hints: {}, work: {}, revealedChoices: [], explanations: {}, seconds: 0, paused: false, studyGuideOpen: !!(selectedExam.studyGuide || selectedExam.readingReferences?.length) }
    setRun(active); setExam(selectedExam); setMode(selectedMode); setScreen('run'); setError(''); setConfirmFinish(false); setFocus(false)
  }
  const start = (resume = false) => {
    if (!resume || !run) { startWith(exam, mode); return }
    const active = run
    setRun(active); setExam(active.exam); setMode(active.mode); setScreen('run'); setError(''); setConfirmFinish(false)
  }
  const updateRun = (fn: (current: RunData) => RunData) => setRun(r => r ? fn(r) : r)
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
  }
  const finish = () => {
    if (!run) return
    const done = { ...run, completed: true, committed: run.exam.questions.map(q => q.id), paused: true }
    setRun(done); setScreen('results'); setConfirmFinish(false)
  }
  const reset = () => { setRun(null); setScreen('welcome'); setFocus(false) }
  const current = run?.exam.questions[run.index]
  const explanationPrompt = current ? `You are a patient tutor. Help the learner understand this exact question without changing its meaning.\n\nEXAM: ${run?.exam.title ?? ''}\nSUBJECT: ${run?.exam.subject ?? ''}\nQUESTION DATA (authoritative JSON):\n${JSON.stringify(current, null, 2)}\n\nLEARNER REQUEST: ${explainRequest.trim() || 'Explain the question clearly and identify what it is asking.'}\n\nAvailable output tools: Markdown text, inline/display LaTeX, and a declarative 2D SVG drawing. Use a drawing only when it materially helps (geometry, graphs, diagrams); do not emit executable code, scripts, external URLs, or 3D. Return exactly one JSON object, no fences or extra prose, in this protocol:\n{\n  "protocol": "stillroom.explanation.v1",\n  "questionId": ${JSON.stringify(current.id)},\n  "title": "Brief heading",\n  "blocks": [\n    { "type": "markdown", "content": "Explanation using Markdown and delimited LaTeX" },\n    { "type": "svg", "title": "Diagram title", "viewBox": "0 0 400 240", "elements": [{ "shape": "line", "x1": 20, "y1": 120, "x2": 380, "y2": 120, "stroke": "#536b55", "strokeWidth": 2 }, { "shape": "circle", "cx": 200, "cy": 120, "r": 8, "fill": "#536b55" }, { "shape": "text", "x": 208, "y": 110, "text": "A", "fill": "#303a32" }] }\n  ]\n}\nUse only markdown blocks and SVG elements line, circle, rect, path, text, polygon. SVG coordinates must fit viewBox; use simple paths and short labels. Omit SVG when unnecessary. Do not reveal the answer unless the learner explicitly asks; focus on interpreting terms, givens, goals, and a first step. Do not include HTML or arbitrary SVG attributes.` : ''
  const copyExplanationPrompt = async () => { try { await navigator.clipboard.writeText(explanationPrompt) } catch { /* The prompt remains selectable in its preview. */ } setExplainCopied(true); window.setTimeout(() => setExplainCopied(false), 2200) }
  const visibleExam = run?.exam ?? exam
  const formatNames: Record<QuestionType, string> = { 'multiple-choice': 'multiple choice', 'short-answer': 'short answer', 'free-response': 'written response', proof: 'proof' }
  const formatCounts = visibleExam.questions.reduce<Partial<Record<QuestionType, number>>>((counts, q) => {
    const type = questionType(q)
    counts[type] = (counts[type] ?? 0) + 1
    return counts
  }, {})
  const formatSummary = (Object.entries(formatCounts) as [QuestionType, number][]).map(([type, count]) => `${count} ${formatNames[type]}`).join(' · ')
  const answered = run?.committed.length ?? 0
  const selected = current && run ? run.answers[current.id] : undefined
  const committed = !!current && !!run?.committed.includes(current.id)
  const isMultipleChoice = !!current && questionType(current) === 'multiple-choice'
  const correct = !!current && (isMultipleChoice ? selected === current.answer : run?.selfGrades[current.id] === 'met')
  const choicesHidden = !!current && isMultipleChoice && !!run?.exam.hideOptionsUntilWork && !run.revealedChoices.includes(current.id)
  const correctChoice = current?.choices.find(choice => choice.id === current.answer)
  const earned = current && run && committed && correct ? Math.max(0, (current.points ?? run.exam.pointsPerQuestion ?? 100) - current.hints.slice(0, run.hints[current.id] ?? 0).reduce((s, h) => s + h.cost, 0)) : 0
  const choicesView = current && run && <div className="choices-list" role="group" aria-label="Answer choices">{current.choices.map((choice, i) => { const chosen = selected === choice.id; const reveal = committed || (run.mode === 'feedback' && chosen); const isAnswer = choice.id === current.answer; return <button key={choice.id} className={`choice ${chosen ? 'chosen' : ''} ${reveal && isAnswer ? 'correct' : ''} ${reveal && chosen && !isAnswer ? 'incorrect' : ''} ${committed ? 'locked' : ''}`} onClick={() => { if (committed) return; updateRun(r => ({ ...r, answers: { ...r.answers, [current.id]: r.answers[current.id] === choice.id && r.mode === 'washback' ? '' : choice.id } })) }} disabled={committed}><span className="choice-letter">{String.fromCharCode(65 + i)}</span><Content className="choice-text" text={choice.text} /><span className="choice-result">{reveal && isAnswer ? <Check size={16} /> : reveal && chosen ? <X size={15} /> : chosen ? <span className="radio-dot" /> : null}</span></button> })}</div>
  const choiceReview = current?.choiceExplanations && current.choices.filter(choice => choice.id !== current.answer && current.choiceExplanations?.[choice.id]).map(choice => <div className="choice-review-row" key={choice.id}><div className="choice-review-label"><span>Wrong option {String.fromCharCode(65 + current.choices.indexOf(choice))}</span><Content className="wrong-choice-value" text={choice.text} /></div><Content className="choice-review-text" text={current.choiceExplanations?.[choice.id] ?? ''} /></div>)

  return <div className={`app-shell ${focus && screen === 'run' ? 'focus-mode' : ''}`}>
    <header className="topbar">
      <button className="brand" onClick={() => screen === 'run' ? setConfirmFinish(true) : setScreen('welcome')} aria-label="Stillroom home"><span className="brand-icon"><span /></span><span className="brand-name">stillroom<span className="brand-period">.</span></span></button>
      <div className="topbar-center"><span className="quiet-mark" />A QUIET PLACE TO THINK</div>
      <div className="topbar-right">
        {screen === 'run' && <span className="saved-state"><span />Autosaved</span>}
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
    {screen === 'library' && <main className="exam-library">
      <button className="back-link" onClick={() => setScreen('welcome')}><ArrowLeft size={15} /> Home</button>
      <h1>Your exams</h1>
      <button className="secondary-button" disabled={!ready} onClick={() => { setJsonText(''); setError(''); setJsonOpen(true) }}>Import exam</button>
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
      {!library.length && <p>{ready ? 'Your exams will appear here when you start practicing.' : 'Loading exams?'}</p>}
      {library.map(item => <article key={item.id}>
        <h2>{item.exam.title}</h2><p>{item.completed ? 'Completed' : 'In progress'} ? {item.exam.questions.length} questions ? {new Date(item.updated).toLocaleString()}</p>
        {item.completed && <details><summary>Review answers</summary>{item.exam.questions.map(q => <section key={q.id}>
          <Content text={q.prompt} /><h3>Your answer</h3><Content text={item.responses[q.id] || q.choices.find(c => c.id === item.answers[q.id])?.text || 'Unanswered'} />
          <h3>Model answer</h3><Content text={q.expectedAnswer || q.choices.find(c => c.id === q.answer)?.text || ''} />
          {q.rubric && <><h3>Grading rubric</h3><Content text={q.rubric} /></>}
          {item.explanations[q.id] && <ExplanationDocument raw={item.explanations[q.id]} questionId={q.id} />}
        </section>)}</details>}
        <button className="secondary-button" onClick={() => {
          if (item.completed) startWith(item.exam, item.mode)
          else { setRun(item); setExam(item.exam); setMode(item.mode); setScreen('run') }
        }}>{item.completed ? 'Practice again' : 'Resume attempt'}</button>
      </article>)}
    </main>}
    {screen === 'welcome' && ready && <main className="welcome-page">
      <div className="welcome-copy"><div className="eyebrow"><Sparkles size={13} /> YOUR PRIVATE STUDY SPACE</div><h1>Think slowly.<br /><em>See clearly.</em></h1><p className="welcome-intro">A distraction-free place to test what you know, follow the hard parts, and learn from every attempt.</p><div className="welcome-meta"><span><span className="meta-dot" /> Built for deep work</span><span className="meta-divider" /><span>Bring any subject</span></div></div>
      <section className="exam-launch-card"><div className="launch-card-top"><div className="launch-symbol"><Layers2 size={19} strokeWidth={1.7} /></div><span className="launch-count">SESSION 01 <i>—</i> {exam.questions.length} QUESTIONS</span></div><div className="launch-subject">{exam.subject || 'Your next study session'}</div><h2>{exam.title}</h2><p>{exam.subtitle || 'A focused set of questions to work through at your own pace.'}</p><div className="launch-format-summary"><span>QUESTION FORMATS</span><b>{formatSummary}</b></div><div className="launch-rule" /><div className="mode-label">CHOOSE YOUR PACE</div><div className="mode-switch" role="group" aria-label="Exam mode">
        <button className={mode === 'washback' ? 'active' : ''} onClick={() => setMode('washback')}><span className="mode-glyph">?</span><span><b>Washback</b><small>One at a time, hints cost points</small></span></button><button className={mode === 'feedback' ? 'active' : ''} onClick={() => setMode('feedback')}><span className="mode-glyph">?</span><span><b>Feedback</b><small>Explore answers as you go</small></span></button>
      </div><div className="launch-actions">{run && !run.completed ? <><button className="primary-button" onClick={() => start(true)}>Continue session <ArrowRight size={16} /></button><button className="secondary-button" onClick={() => { start() }}><RotateCcw size={14} /> Start fresh</button></> : <><button className="primary-button" onClick={() => setPromptOpen(true)}><Sparkles size={15} /> Build an exam prompt</button><button className="secondary-button" onClick={() => start()}>Try the sample exam <ArrowRight size={14} /></button><button className="launch-import-link import-direct" onClick={() => { setJsonText(''); setJsonOpen(true); setError('') }}><FileJson2 size={12} /> I already have exam JSON</button></>}</div>{run && <div className="saved-exam-actions"><button className="launch-import-link" onClick={() => setPromptOpen(true)}><Sparkles size={12} /> Build a prompt for a new exam</button><button className="launch-import-link" onClick={() => { setJsonText(''); setJsonOpen(true); setError('') }}><FileJson2 size={12} /> Bring a different exam</button></div>}<div className="launch-foot"><LockKeyhole size={12} /> Your progress stays on this device</div></section>
      <div className="welcome-footer"><span>MADE FOR THE MOMENT BEFORE IT CLICKS</span><span className="footer-orbit">?</span></div>
    </main>}

    {screen === 'run' && run && current && <main className="run-page"><div className="run-heading"><button className="back-link" onClick={() => { setScreen('welcome'); setFocus(false) }}><ArrowLeft size={15} /> Leave session</button><div className="run-title-wrap"><span className="run-subject">{run.exam.subject || 'Independent study'} <span>—</span> {run.mode === 'washback' ? 'Washback' : 'Feedback'}</span><h1>{run.exam.title}</h1></div><div className="run-heading-right"><div className="score-chip"><span>POINTS</span><b>{score(run)}<i> / {maxScore}</i></b></div><button className="focus-button new-prompt-button" onClick={() => setPromptOpen(true)} title="Build a prompt for a different exam"><Sparkles size={14} /> New exam</button><button className={`focus-button ${focus ? 'selected' : ''}`} onClick={() => setFocus(f => !f)}><Focus size={15} /> {focus ? 'Exit focus' : 'Focus mode'}</button></div></div>
      {run.studyGuideOpen && <section className="study-guide-panel"><div className="eyebrow">BEFORE YOU BEGIN</div><h2>Study notes</h2>{run.exam.studyGuide && <Content className="study-guide-content" text={run.exam.studyGuide} />}{run.exam.readingReferences?.length ? <div><h3>Suggested reading</h3><ul>{run.exam.readingReferences.map((item, i) => <li key={i}><Content text={item} /></li>)}</ul></div> : null}<button className="primary-button" onClick={() => updateRun(r => ({...r, studyGuideOpen:false}))}>Go to questions <ArrowRight size={15}/></button></section>}<div className="run-guide-toggle" style={{display:run.exam.studyGuide || run.exam.readingReferences?.length ? undefined : "none"}}><button className="secondary-button" onClick={() => updateRun(r => ({...r, studyGuideOpen:true}))}>Study notes and reading</button></div><div className="run-layout" style={{display:run.studyGuideOpen?"none":undefined}}><aside className="study-rail"><div className="rail-section rail-progress"><div className="rail-label">YOUR PROGRESS <span>{answered.toString().padStart(2, '0')} / {run.exam.questions.length.toString().padStart(2, '0')}</span></div><div className="progress-track"><i style={{ width: `${answered / run.exam.questions.length * 100}%` }} /></div><div className="question-map">{run.exam.questions.map((q, i) => { const done = run.committed.includes(q.id); const active = i === run.index; const qCorrect = questionType(q) === 'multiple-choice' ? run.answers[q.id] === q.answer : run.selfGrades[q.id] === 'met'; return <button key={q.id} className={`map-item ${active ? 'current' : ''} ${done ? 'done' : ''} ${done && qCorrect ? 'map-correct' : ''}`} onClick={() => { if (run.mode === 'feedback' || done || i <= run.index) updateRun(r => ({ ...r, index: i })) }} disabled={run.mode === 'washback' && !done && i > run.index} aria-label={`Question ${i + 1}${done ? ', answered' : ''}`}><span className="map-num">{done && qCorrect ? <Check size={12} /> : String(i + 1).padStart(2, '0')}</span><span className="map-topic">{q.topic || `Question ${i + 1}`}</span><span className="map-state">{active ? 'NOW' : done ? 'DONE' : '—'}</span></button> })}</div></div>
        <div className="rail-section rail-tools"><div className="rail-label">SESSION</div><div className="clock"><Clock3 size={14} /><span>{fmtTime(run.seconds)}</span><button title={run.paused ? 'Resume timer' : 'Pause timer'} onClick={() => updateRun(r => ({ ...r, paused: !r.paused }))}>{run.paused ? <Play size={13} /> : <Pause size={13} />}</button></div><p className="timer-note">Time is for reflection, not pressure.</p></div>
        <div className="rail-bottom"><div className="mode-note"><span className="note-icon"><Lightbulb size={14} /></span><p><b>{run.mode === 'washback' ? 'A deliberate pace' : 'Learn as you go'}</b><br />{run.mode === 'washback' ? 'Commit each answer to reveal its explanation.' : 'Move freely and check each answer when ready.'}</p></div><button className="finish-link" onClick={() => setConfirmFinish(true)}>Finish session <ArrowRight size={14} /></button></div></aside>
        <section className="question-stage" key={current.id}><div className="question-topline"><div className="question-number">QUESTION <b>{String(run.index + 1).padStart(2, '0')}</b><span> / {String(run.exam.questions.length).padStart(2, '0')}</span></div><div className="question-tags"><span className="topic-tag">{{'multiple-choice':'Multiple choice','short-answer':'Short answer','free-response':'Written response','proof':'Proof'}[questionType(current)]}</span>{current.topic && <span className="topic-tag">{current.topic}</span>}{current.difficulty && <span className={`difficulty ${current.difficulty}`}>{current.difficulty}</span>}</div></div>
          <div className="question-body"><div className="question-overline">TAKE A MOMENT WITH THIS ONE</div><Content className="question-prompt" text={current.prompt} />
          <div className="explain-more"><button className="secondary-button" onClick={() => { setExplainRequest(''); setExplainOpen(true) }}><CircleHelp size={14} /> {run.explanations?.[current.id] ? 'Ask for another explanation' : 'Explain more'}</button>{run.explanations?.[current.id] && <section className={`saved-explanation ${explanationExpanded ? 'expanded' : ''}`}><button className="saved-explanation-toggle" aria-expanded={explanationExpanded} onClick={() => setExplanationExpanded(value => !value)}><span><b>Question explanation</b><small>{explanationExpanded ? 'Hide explanation' : 'Show saved explanation'}</small></span><ChevronDown size={18} aria-hidden="true" /></button><div className="saved-explanation-content" hidden={!explanationExpanded}><ExplanationDocument raw={run.explanations[current.id]} questionId={current.id} /></div></section>}</div>
          {isMultipleChoice ? choicesHidden ? <section className="solve-first-panel" aria-label="Solve before seeing choices"><div className="solve-first-heading"><span className="note-icon"><Layers2 size={15} /></span><span><b>Work it out first</b><small>Your answer choices are hidden until you record a result.</small></span></div><label htmlFor={`work-${current.id}`}>Your result, proof, or working</label><textarea id={`work-${current.id}`} value={run.work[current.id] ?? ''} onChange={e => updateRun(r => ({ ...r, work: { ...r.work, [current.id]: e.target.value } }))} placeholder="Write your result here. You can use LaTeX, for example $\lambda=0$." /><button className="action-button primary" onClick={() => updateRun(r => ({ ...r, revealedChoices: [...r.revealedChoices, current.id] }))} disabled={!(run.work[current.id] ?? '').trim()}>Reveal choices to compare <ArrowRight size={15} /></button></section> : <>{run.exam.hideOptionsUntilWork && run.work[current.id] && <div className="work-note"><span>Your work</span><Content className="work-note-content" text={run.work[current.id]} /></div>}{choicesView}</> : <section className={`written-response written-${questionType(current)}`}><label htmlFor={`response-${current.id}`}>Your {questionType(current) === 'proof' ? 'proof' : questionType(current) === 'short-answer' ? 'short answer' : 'written response'}</label>{!committed && <small className="response-guidance">{questionType(current) === 'proof' ? 'State the argument in clear steps and justify each implication.' : questionType(current) === 'short-answer' ? 'Keep it concise; include the key result or reasoning.' : 'Show your full reasoning, derivation, and conclusion.'}</small>}{committed ? <div className="work-note"><Content className="work-note-content" text={run.responses[current.id] ?? ''} /></div> : <textarea id={`response-${current.id}`} value={run.responses[current.id] ?? ''} onChange={e => updateRun(r => ({ ...r, responses: { ...r.responses, [current.id]: e.target.value } }))} placeholder={questionType(current) === 'short-answer' ? 'Write a concise answer…' : questionType(current) === 'proof' ? 'Write your proof here. Mathematical notation can use LaTeX, for example $T(v)=\lambda v$.' : 'Write your full response here. Mathematical notation can use LaTeX.'} />}</section>}
          {run.mode === 'washback' && !committed && current.hints.length > 0 && <div className="hint-area"><div className="hint-heading"><span><Lightbulb size={15} /> Need a foothold?</span><span>Each hint lowers this question—s points</span></div><div className="hint-list">{current.hints.map((hint, i) => { const open = (run.hints[current.id] ?? 0) > i; return <div className={`hint-card ${open ? 'revealed' : ''}`} key={`${current.id}-${i}`}><button onClick={() => { if (!open) updateRun(r => ({ ...r, hints: { ...r.hints, [current.id]: i + 1 } })) }} disabled={open}><span className="hint-lock">{open ? <Check size={13} /> : String(i + 1).padStart(2, '0')}</span><span className="hint-name">{hint.label}</span>{open ? <span className="hint-cost">-{hint.cost} pts</span> : <span className="hint-cost">-{hint.cost} pts <ChevronDown size={12} /></span>}</button>{open && <Content className="hint-rich" text={hint.text} />}</div> })}</div></div>}
          {committed && <div className={`answer-review ${correct ? 'review-correct' : 'review-wrong'}`}><div className="review-heading">{correct ? <><CheckCheck size={16} /> {isMultipleChoice ? `Correct — ${earned} points` : `Self-checked — ${earned} points`}</> : <><X size={15} /> {isMultipleChoice ? 'Not quite — take the idea with you' : 'Compare your work with the model answer'}</>}</div><div className="review-answer"><span>{isMultipleChoice ? 'Correct answer' : 'Model answer'}</span><Content className="correct-answer-value" text={isMultipleChoice ? (correctChoice?.text ?? '') : (current.expectedAnswer ?? '')} /></div>{!isMultipleChoice && current.rubric && <div className="rubric-review"><b>Grading rubric</b><Content className="explanation-rich" text={current.rubric} /><div className="self-grade"><span>How did your work compare?</span><button className={run.selfGrades[current.id] === 'met' ? 'selected' : ''} onClick={() => updateRun(r => ({ ...r, selfGrades: { ...r.selfGrades, [current.id]: 'met' } }))}>I met the rubric</button><button className={run.selfGrades[current.id] === 'review' ? 'selected' : ''} onClick={() => updateRun(r => ({ ...r, selfGrades: { ...r.selfGrades, [current.id]: 'review' } }))}>Needs more work</button></div></div>}{current.explanation && <Content className="explanation-rich" text={current.explanation} />}{choiceReview && <div className="choice-review"><h3>Why the other choices are wrong</h3>{choiceReview}</div>}</div>}
          {run.mode === 'feedback' && isMultipleChoice && selected && !committed && <div className={`answer-review ${correct ? 'review-correct' : 'review-wrong'}`}><div className="review-heading">{correct ? <><CheckCheck size={16} /> That—s right</> : <><X size={15} /> Take another look</>}</div><div className="review-answer"><span>Correct answer</span><Content className="correct-answer-value" text={correctChoice?.text ?? ''} /></div>{current.explanation && <Content className="explanation-rich" text={current.explanation} />}{choiceReview && <div className="choice-review"><h3>Why the other choices are wrong</h3>{choiceReview}</div>}</div>}
          </div><div className="question-footer"><div className="footer-note"><span className="keycap">{run.mode === 'washback' ? '01' : '?'}</span>{run.mode === 'washback' ? 'One considered answer. Then the reasoning.' : 'Change your answer until you move on.'}</div><div className="question-actions">{!isMultipleChoice && !committed && <button className="action-button primary" onClick={() => submit(current)} disabled={!(run.responses[current.id] ?? '').trim()}>Submit for review <ArrowRight size={15} /></button>}{run.mode === 'feedback' && (isMultipleChoice || committed) && <button className="action-button secondary" onClick={() => { if (run.index < run.exam.questions.length - 1) updateRun(r => ({ ...r, index: r.index + 1 })); else setConfirmFinish(true) }}>{run.index === run.exam.questions.length - 1 ? 'Finish review' : 'Next question'} <ArrowRight size={15} /></button>}{run.mode === 'washback' && !committed && isMultipleChoice && <><button className="action-button text-action" onClick={() => submit(current, true)}>I don—t know</button><button className="action-button primary" onClick={() => submit(current)} disabled={!selected}>Lock in answer <ArrowRight size={15} /></button></>}{run.mode === 'washback' && committed && <button className="action-button primary" onClick={() => { if (run.committed.length === run.exam.questions.length) { finish() } else updateRun(r => ({ ...r, index: Math.min(r.index + 1, r.exam.questions.length - 1) })) }}>{run.committed.length === run.exam.questions.length ? 'See your reflection' : 'Continue'} <ArrowRight size={15} /></button>}</div></div>
        </section></div></main>}

    {screen === 'results' && run && <main className="results-page"><div className="result-mark"><CheckCheck size={24} /></div><div className="eyebrow">SESSION COMPLETE</div><h1>Good work.<br /><em>Let it settle.</em></h1><p className="result-subtitle">{run.exam.title} — {fmtTime(run.seconds)} of considered work</p><div className="result-score"><span>YOUR SCORE</span><b>{score(run)}<i> / {maxScore}</i></b><div className="result-bar"><i style={{ width: `${maxScore ? score(run) / maxScore * 100 : 0}%` }} /></div><small>{run.exam.questions.filter(q => questionType(q) === 'multiple-choice' ? run.answers[q.id] === q.answer : run.selfGrades[q.id] === 'met').length} of {run.exam.questions.length} self-checked as correct</small></div><div className="result-actions"><button className="primary-button" onClick={() => { start() }}><RotateCcw size={15} /> Try this set again</button><button className="secondary-button" onClick={reset}>Return to your space</button></div><div className="result-quote">—Understanding is not a destination. It is the shape of the next question.—</div></main>}

    {jsonOpen && <div className="modal-backdrop" onClick={() => setJsonOpen(false)}><section className="json-modal" onClick={e => e.stopPropagation()}><div className="modal-heading"><div><span className="eyebrow">EXAM SOURCE</span><h2>Bring your own questions</h2></div><button className="icon-button" onClick={() => setJsonOpen(false)} aria-label="Close"><X size={17} /></button></div><p className="modal-copy">Paste a JSON exam or load a file. Your questions can be on any subject, in any language.</p><button className="file-drop" onClick={() => fileRef.current?.click()}><FileJson2 size={19} /><span><b>Choose a JSON file</b><small>.json — stays on your device</small></span><ArrowRight size={15} /></button><input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={async e => { const file = e.target.files?.[0]; if (file) importJson(await file.text()) }} /><div className="textarea-label">OR PASTE JSON</div><textarea value={jsonText} onChange={e => setJsonText(e.target.value)} placeholder="Paste your exam JSON here—" spellCheck={false} /><div className="modal-bottom">{error && <span className="error-text">{error}</span>}<button className="primary-button" onClick={() => importJson(jsonText)} disabled={!jsonText.trim()}>Use and start exam <ArrowRight size={15} /></button></div><button className="format-link" onClick={() => setJsonText(JSON.stringify(demoExam, null, 2))}>View a complete example format</button></section></div>}

    {promptOpen && <div className="modal-backdrop" onClick={() => setPromptOpen(false)}><section className="prompt-modal" role="dialog" aria-modal="true" aria-labelledby="prompt-title" onClick={e => e.stopPropagation()}><div className="modal-heading"><div><span className="eyebrow"><Sparkles size={12} /> PROMPT STUDIO</span><h2 id="prompt-title">Shape your next exam</h2></div><button className="icon-button" onClick={() => setPromptOpen(false)} aria-label="Close"><X size={17} /></button></div><p className="modal-copy">Set the scope. Your copy-ready instruction updates as you edit. Paste it into your preferred LLM, then bring its JSON response back here.</p><div className="prompt-fields">
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
      <label>Subject or topic<input value={promptSpec.subject} onChange={e => setPromptSpec(s => ({ ...s, subject: e.target.value }))} placeholder={purpose === 'general' ? defaultPrompt.subject : 'Infer from your material'} /></label><label>Learning goal<textarea rows={2} placeholder={purpose === 'general' ? defaultPrompt.goal : 'Optional focus for this set'} value={promptSpec.goal} onChange={e => setPromptSpec(s => ({ ...s, goal: e.target.value }))} /></label><label>Level<input placeholder={purpose === 'general' ? defaultPrompt.level : 'Match your material'} value={promptSpec.level} onChange={e => setPromptSpec(s => ({ ...s, level: e.target.value }))} /></label><div className="prompt-counts"><span>Questions by type <small>{Object.values(promptSpec.questionCounts).reduce((sum, value) => sum + value, 0)} total · maximum 60</small></span><div className="prompt-count-grid">{([ ["multiple-choice", "Multiple choice"], ["short-answer", "Short answer"], ["free-response", "Written response"], ["proof", "Proof"] ] as [QuestionType, string][]).map(([type, label]) => <label key={type}><span>{label}</span><input aria-label={`${label} question count`} type="number" min={0} max={60} value={promptSpec.questionCounts[type]} onChange={e => updateQuestionCount(type, Number(e.target.value))} /></label>)}</div></div><label>Exam mode<select value={promptSpec.mode} onChange={e => setPromptSpec(s => ({ ...s, mode: e.target.value as Exam['mode'] }))}><option value="washback">Washback — one at a time, hints cost points</option><option value="feedback">Feedback — explore and revise answers</option></select></label>{promptSpec.questionCounts['multiple-choice'] > 0 && <label>Options per multiple-choice question<input type="number" min={2} max={8} value={promptSpec.choicesPerQuestion} onChange={e => setPromptSpec(s => ({ ...s, choicesPerQuestion: Math.max(2, Math.min(8, Number(e.target.value) || 2)) }))} /></label>}<label className="prompt-style">Question style<textarea rows={2} placeholder={purpose === 'general' ? defaultPrompt.style : 'Optional style preferences'} value={promptSpec.style} onChange={e => setPromptSpec(s => ({ ...s, style: e.target.value }))} /></label><label className="prompt-check"><input type="checkbox" checked={promptSpec.hideOptionsUntilWork} disabled={promptSpec.questionCounts["multiple-choice"] === 0} onChange={e => setPromptSpec(s => ({ ...s, hideOptionsUntilWork: e.target.checked }))} /><span><b>Solve before seeing choices</b><small>Ask me to write my result before revealing multiple-choice options.</small></span></label><label className="prompt-check"><input type="checkbox" checked={promptSpec.includeReferences} onChange={e => setPromptSpec(s => ({ ...s, includeReferences: e.target.checked }))} /><span><b>Suggest books and chapters</b><small>Include relevant textbook chapters and sections.</small></span></label><label className="prompt-check"><input type="checkbox" checked={promptSpec.includeStudyGuide} onChange={e => setPromptSpec(s => ({ ...s, includeStudyGuide: e.target.checked }))} /><span><b>Include a short study guide</b><small>Show notes before questions and allow switching between them.</small></span></label></div><div className="prompt-preview-head"><span className="textarea-label">LIVE PROMPT PREVIEW</span><span>JSON-only output — app schema included</span></div><textarea ref={promptRef} className="prompt-preview" aria-label="Live prompt preview" value={prompt} placeholder="Add the required material to see your prompt." readOnly spellCheck={false} onFocus={e => e.currentTarget.select()} /><div className="prompt-actions"><button className="secondary-button" onClick={() => { setPromptOpen(false); setJsonText(''); setJsonOpen(true); setError('') }}><FileJson2 size={14} /> I have the JSON</button><button className="primary-button" onClick={copyPrompt} disabled={!promptReady}><Copy size={14} /> {promptCopied ? 'Copied — paste into your LLM' : 'Copy prompt'}</button></div></section></div>}

    {explainOpen && current && <div className="modal-backdrop" onClick={() => setExplainOpen(false)}><section className="prompt-modal" role="dialog" aria-modal="true" aria-labelledby="explain-title" onClick={e => e.stopPropagation()}><div className="modal-heading"><div><span className="eyebrow"><Sparkles size={12} /> QUESTION SUPPORT</span><h2 id="explain-title">Explain this question</h2></div><button className="icon-button" onClick={() => setExplainOpen(false)} aria-label="Close"><X size={17} /></button></div><p className="modal-copy">Copy this question-specific prompt into your LLM. Then paste its JSON explanation below. It will be saved with this session on this device.</p><label className="explain-request-label">What would you like explained?<textarea className="explain-request" rows={3} value={explainRequest} onChange={e => setExplainRequest(e.target.value)} placeholder="For example: What does invariant complement mean here?" /></label><div className="prompt-preview-head"><span className="textarea-label">PROMPT PREVIEW</span><span>Question data and render protocol included</span></div><textarea className="prompt-preview" readOnly value={explanationPrompt} onFocus={e => e.currentTarget.select()} /><div className="explain-response-label">LLM JSON RESPONSE</div><textarea className="explain-response" value={run.explanations?.[current.id] ?? ''} onChange={e => updateRun(r => ({ ...r, explanations: { ...r.explanations, [current.id]: e.target.value } }))} placeholder={'Paste JSON using protocol "stillroom.explanation.v1"'} spellCheck={false} /><div className="prompt-actions"><button className="secondary-button" onClick={copyExplanationPrompt}><Copy size={14} /> {explainCopied ? 'Copied' : 'Copy prompt'}</button><button className="primary-button" onClick={() => setExplainOpen(false)}>Save explanation <Check size={14} /></button></div></section></div>}

    {confirmFinish && <div className="modal-backdrop" onClick={() => setConfirmFinish(false)}><section className="confirm-modal" onClick={e => e.stopPropagation()}><button className="modal-close icon-button" onClick={() => setConfirmFinish(false)} aria-label="Close"><X size={17} /></button><div className="result-mark small"><CheckCheck size={19} /></div><div className="eyebrow">PAUSE AND REFLECT</div><h2>Finish this session?</h2><p>You—ve worked through {answered} of {run?.exam.questions.length} questions. Unanswered questions will count as missed.</p><div className="confirm-actions"><button className="secondary-button" onClick={() => setConfirmFinish(false)}>Keep going</button><button className="primary-button" onClick={finish}>Finish session <ArrowRight size={15} /></button></div></section></div>}
    <footer className="global-footer"><span>STILLROOM <i>—</i> STUDY WITHOUT THE NOISE</span><button onClick={() => { setJsonText(''); setJsonOpen(true); setError('') }}>EXAM FORMAT <ArrowRight size={11} /></button></footer>
  </div>
}

