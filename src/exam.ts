export type Hint = { label: string; text: string; cost: number }
export type Choice = { id: string; text: string }
export type QuestionType = 'multiple-choice' | 'short-answer' | 'free-response' | 'proof'
export type Question = {
  id: string
  type?: QuestionType
  prompt: string
  choices: Choice[]
  answer?: string
  expectedAnswer?: string
  rubric?: string
  explanation: string
  choiceExplanations?: Record<string, string>
  hints: Hint[]
  topic?: string
  difficulty?: string
  points?: number
}
export type Exam = {
  title: string
  subtitle?: string
  subject?: string
  mode: 'feedback' | 'washback'
  pointsPerQuestion?: number
  hideOptionsUntilWork?: boolean
  studyGuide?: string
  readingReferences?: string[]
  questions: Question[]
}

const linearAlgebraHints = (first: string, second: string, third: string): Hint[] => [
  { label: 'Nudge', text: first, cost: 12 },
  { label: 'Structure', text: second, cost: 24 },
  { label: 'Near the result', text: third, cost: 38 },
]

export const demoExam: Exam = {
  title: 'Linear maps, under pressure',
  subtitle: 'A mixed set of proofs, short answers, written responses, and multiple-choice questions.',
  subject: 'Advanced linear algebra',
  mode: 'washback',
  pointsPerQuestion: 100,
  questions: [
    {
      id: 'q1', type: 'proof', topic: 'Invariant subspaces', difficulty: 'brutal', points: 100,
      prompt: 'Let $V$ be finite-dimensional over an algebraically closed field, and let $T\\in\\operatorname{End}(V)$. Suppose every $T$-invariant subspace has a $T$-invariant complement. Prove that the minimal polynomial of $T$ has no repeated roots.',
      choices: [],
      expectedAnswer: 'Regard $V$ as an $F[x]$-module with $x$ acting as $T$. The complement hypothesis makes this module semisimple, so it is a direct sum of simple $F[x]$-modules. Because $F$ is algebraically closed, each simple summand is one-dimensional and $x$ acts on it by a scalar. Thus $T$ is diagonalizable and its minimal polynomial is a product of distinct linear factors.',
      rubric: 'Full credit: translate invariant subspaces to $F[x]$-submodules; use the complement hypothesis to establish semisimplicity; use algebraic closure to identify the simple summands as eigenspaces; conclude that the minimal polynomial is square-free.',
      explanation: 'The complement condition is exactly the module-theoretic semisimplicity condition. Over an algebraically closed field, the simple modules are one-dimensional eigenspaces.',
      hints: linearAlgebraHints('Turn $V$ into an $F[x]$-module by letting $x$ act as $T$.', 'The hypothesis says every submodule splits, so the module is semisimple.', 'Simple $F[x]$-modules over an algebraically closed field are eigenspaces; semisimplicity makes $T$ diagonalizable.'),
    },
    {
      id: 'q2', type: 'short-answer', topic: 'Duality', difficulty: 'deep', points: 100,
      prompt: 'For $A\\in M_n(F)$, state the relationship between the invariant factors of $A$ and $A^T$. Is algebraic closure of $F$ required?',
      choices: [],
      expectedAnswer: '$A$ and $A^T$ have the same invariant factors. This holds over any field $F$; algebraic closure is not required.',
      rubric: 'Full credit requires both the equality of the invariant-factor lists and the statement that the result holds over an arbitrary field.',
      explanation: 'A matrix and its transpose have the same rational canonical data, so their invariant factors agree over any field.',
      hints: linearAlgebraHints('Think about the relation between a linear map and its dual.', 'Transposition preserves the ranks of polynomial expressions in the matrix.', 'The invariant-factor lists of $A$ and $A^T$ agree without assumptions on $F$.'),
    },
    {
      id: 'q3', type: 'free-response', topic: 'Spectral theory', difficulty: 'brutal', points: 100,
      prompt: 'Let $A$ be a normal complex matrix with the single eigenvalue $\\lambda$. Explain why $A$ must be scalar, and identify where normality is used.',
      choices: [],
      expectedAnswer: 'By the spectral theorem, $A=UDU^*$ for a unitary $U$ and diagonal $D$. Every diagonal entry of $D$ is an eigenvalue of $A$, so $D=\\lambda I$. Therefore $A=U(\\lambda I)U^*=\\lambda I$. Normality guarantees unitary diagonalizability; without it, a nontrivial Jordan block can have only the eigenvalue $\\lambda$ without being scalar.',
      rubric: 'Full credit: cite the spectral theorem for normal complex matrices; show every diagonal entry equals $\\lambda$; conjugate back to obtain $A=\\lambda I$; explain why the conclusion can fail without normality.',
      explanation: 'Normality supplies unitary diagonalization. The single-eigenvalue condition then forces the diagonal form to be $\\lambda I$.',
      hints: linearAlgebraHints('Which canonical form does normality guarantee over $\\mathbb{C}$?', 'Use the spectral theorem to write $A=UDU^*$.', 'All diagonal entries of $D$ are the only eigenvalue $\\lambda$.'),
    },
    {
      id: 'q4', type: 'multiple-choice', topic: 'Tensor products', difficulty: 'deep', points: 100,
      prompt: 'For linear maps $S:V\\to V$ and $T:W\\to W$ on finite-dimensional spaces, which identity is correct?',
      choices: [
        { id: 'a', text: '$\\operatorname{tr}(S\\otimes T)=\\operatorname{tr}(S)+\\operatorname{tr}(T)$' },
        { id: 'b', text: '$\\operatorname{tr}(S\\otimes T)=\\operatorname{tr}(S)\\operatorname{tr}(T)$' },
        { id: 'c', text: '$\\operatorname{tr}(S\\otimes T)=\\dim(W)\\operatorname{tr}(S)+\\dim(V)\\operatorname{tr}(T)$' },
        { id: 'd', text: '$\\operatorname{tr}(S\\otimes T)=\\frac{\\operatorname{tr}(S)\\operatorname{tr}(T)}{\\dim(V\\otimes W)}$' },
      ],
      answer: 'b',
      explanation: 'In bases where $S$ and $T$ have matrices $A$ and $B$, the tensor product has matrix $A\\otimes B$. Summing its diagonal entries gives $\\operatorname{tr}(A)\\operatorname{tr}(B)$.',
      choiceExplanations: {
        a: 'The trace of a tensor product multiplies; it does not add the traces of the factors.',
        c: 'Dimension factors appear in traces such as $\\operatorname{tr}(S\\otimes I_W)$, not when both factors are arbitrary.',
        d: 'There is no division by the tensor-product dimension in the trace identity.',
      },
      hints: linearAlgebraHints('Consider the diagonal entries of a Kronecker product.', 'Each diagonal entry is a product of one diagonal entry from each factor.', 'Sum over all pairs of diagonal indices to obtain $\\operatorname{tr}(S)\\operatorname{tr}(T)$.'),
    },
  ],
}
const isRecord = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)
const keep = (source: Record<string, unknown>, keys: string[]) => Object.fromEntries(keys.filter(key => source[key] !== undefined).map(key => [key, source[key]]))

/** Accept the exam object directly or wrapped in common LLM response envelopes. */
function findExam(value: unknown, depth = 0): unknown {
  if (!isRecord(value) || depth > 6) return null
  if (Array.isArray(value.questions)) return value
  for (const key of ['exam', 'data', 'result', 'output', 'content', 'response', 'quiz']) {
    const found = findExam(value[key], depth + 1)
    if (found) return found
  }
  // Some models add an arbitrary wrapper key; inspect object-valued properties as a fallback.
  for (const nested of Object.values(value)) {
    const found = findExam(nested, depth + 1)
    if (found) return found
  }
  return null
}

/** Find balanced JSON objects in surrounding prose/fences, respecting quoted braces. */
function jsonCandidates(raw: string): string[] {
  const candidates = [raw.trim()]
  let start = -1, depth = 0, quoted = false, escaped = false
  for (let i = 0; i < raw.length; i++) {
    const char = raw[i]
    if (quoted) {
      if (escaped) escaped = false
      else if (char === '\\') escaped = true
      else if (char === '"') quoted = false
      continue
    }
    if (char === '"') quoted = true
    else if (char === '{') { if (depth++ === 0) start = i }
    else if (char === '}' && depth > 0 && --depth === 0 && start >= 0) candidates.push(raw.slice(start, i + 1))
  }
  return [...new Set(candidates)]
}

/** JSON only permits a small set of backslash escapes; LLMs often emit LaTeX commands with a single slash. */
function escapeInvalidJsonBackslashes(raw: string): string {
  let output = '', inString = false
  for (let i = 0; i < raw.length; i++) {
    const char = raw[i]
    if (!inString) {
      output += char
      if (char === '"') inString = true
      continue
    }
    if (char === '"') { output += char; inString = false; continue }
    if (char === '\\') {
      const next = raw[i + 1]
      if (next && !['"', '\\', '/', 'b', 'f', 'n', 'r', 't', 'u'].includes(next)) output += '\\\\'
      else {
        output += char
        if (next) output += raw[++i]
      }
      continue
    }
    output += char
  }
  return output
}

export function parseExam(raw: string): Exam {
  let value: unknown
  for (const candidate of jsonCandidates(raw)) {
    try {
      let decoded: unknown
      try { decoded = JSON.parse(candidate) }
      catch { decoded = JSON.parse(escapeInvalidJsonBackslashes(candidate)) }
      const parsed = findExam(decoded)
      if (parsed) { value = parsed; break }
    } catch { /* Try the next balanced object, which may be the actual exam. */ }
  }
  if (!value) throw new Error('Could not find a valid JSON exam. Paste the exam object, even if it is surrounded by extra text.')
  return validateExam(value)
}

export function validateExam(value: unknown): Exam {
  const found = findExam(value)
  if (!found) throw new Error('The JSON must contain an exam object with a questions array.')
  const exam = found as Record<string, unknown>
  if (typeof exam.title !== 'string' || !exam.title.trim() || !Array.isArray(exam.questions) || exam.questions.length === 0) throw new Error('Add a title and at least one question.')
  if (exam.subtitle !== undefined && typeof exam.subtitle !== 'string') throw new Error('Exam subtitle must be a string.')
  if (exam.subject !== undefined && typeof exam.subject !== 'string') throw new Error('Exam subject must be a string.')
  if (exam.studyGuide !== undefined && typeof exam.studyGuide !== 'string') throw new Error('Study guide must be a Markdown string.')
  if (exam.readingReferences !== undefined && (!Array.isArray(exam.readingReferences) || exam.readingReferences.some(reference => typeof reference !== 'string'))) throw new Error('Reading references must be an array of strings.')
  if (exam.pointsPerQuestion !== undefined && (typeof exam.pointsPerQuestion !== 'number' || !Number.isFinite(exam.pointsPerQuestion) || exam.pointsPerQuestion < 0)) throw new Error('Points per question must be a non-negative number.')
  const questions = (exam.questions as unknown[]).map((rawQuestion, index): Question => {
    if (!isRecord(rawQuestion)) throw new Error(`Question ${index + 1} must be an object.`)
    const question = rawQuestion
    if (typeof question.prompt !== 'string' || !question.prompt.trim()) throw new Error(`Question ${index + 1} needs a prompt.`)
    if (typeof question.id !== 'string' || !question.id.trim()) throw new Error(`Question ${index + 1} needs a string id.`)
    const rawChoices = Array.isArray(question.choices) ? question.choices : []
    const knownTypes = ['multiple-choice', 'short-answer', 'free-response', 'proof']
    const inferredType = rawChoices.length ? 'multiple-choice' : 'short-answer'
    const type = knownTypes.includes(String(question.type)) ? question.type as QuestionType : inferredType
    if (question.points !== undefined && (typeof question.points !== 'number' || !Number.isFinite(question.points) || question.points < 0)) throw new Error(`Question ${index + 1} points must be a non-negative number.`)
    const choices = rawChoices.map((rawChoice, choiceIndex) => {
      if (!isRecord(rawChoice) || typeof rawChoice.id !== 'string' || !rawChoice.id.trim() || typeof rawChoice.text !== 'string') throw new Error(`Question ${index + 1}, choice ${choiceIndex + 1} needs a text and non-empty string id.`)
      return keep(rawChoice, ['id', 'text']) as Choice
    })
    if (new Set(choices.map(choice => choice.id)).size !== choices.length) throw new Error(`Question ${index + 1} has duplicate choice ids.`)
    if (type === 'multiple-choice') {
      if (choices.length < 2) throw new Error(`Question ${index + 1} needs at least two choices.`)
      if (typeof question.answer !== 'string' || !choices.some(choice => choice.id === question.answer)) throw new Error(`Question ${index + 1} answer must match one choice id.`)
      if (typeof question.explanation !== 'string') throw new Error(`Question ${index + 1} needs an explanation string.`)
    } else {
      if (typeof question.expectedAnswer !== 'string' || !question.expectedAnswer.trim()) throw new Error(`Question ${index + 1} needs an expectedAnswer for its written response.`)
      if (typeof question.rubric !== 'string' || !question.rubric.trim()) throw new Error(`Question ${index + 1} needs a grading rubric.`)
      if (question.explanation !== undefined && typeof question.explanation !== 'string') throw new Error(`Question ${index + 1} explanation must be a string.`)
      if (choices.length) throw new Error(`Question ${index + 1} is written-response type and should not include choices.`)
    }
    const hints = Array.isArray(question.hints) ? question.hints.map((rawHint, hintIndex) => {
      if (!isRecord(rawHint) || typeof rawHint.label !== 'string' || typeof rawHint.text !== 'string' || typeof rawHint.cost !== 'number' || !Number.isFinite(rawHint.cost) || rawHint.cost < 0) throw new Error(`Question ${index + 1}, hint ${hintIndex + 1} needs a label, text, and non-negative numeric cost.`)
      return keep(rawHint, ['label', 'text', 'cost']) as unknown as Hint
    }) : []
    let choiceExplanations: Record<string, string> | undefined
    if (question.choiceExplanations !== undefined) {
      const rawExplanations = question.choiceExplanations
      if (type !== 'multiple-choice' || !isRecord(rawExplanations)) return { ...keep(question, ['id', 'prompt', 'answer', 'expectedAnswer', 'rubric', 'explanation', 'topic', 'difficulty', 'points']), explanation: typeof question.explanation === 'string' ? question.explanation : '', type, choices, hints } as Question
      const wrongChoices = choices.filter(choice => choice.id !== question.answer)
      for (const choice of wrongChoices) if (typeof rawExplanations[choice.id] !== 'string' || !(rawExplanations[choice.id] as string).trim()) throw new Error(`Question ${index + 1} needs a non-empty choice explanation for ${choice.id}.`)
      choiceExplanations = Object.fromEntries(wrongChoices.map(choice => [choice.id, rawExplanations[choice.id]])) as Record<string, string>
    }
    return { ...keep(question, ['id', 'prompt', 'answer', 'expectedAnswer', 'rubric', 'explanation', 'topic', 'difficulty', 'points']), explanation: typeof question.explanation === 'string' ? question.explanation : '', type, choices, hints, ...(choiceExplanations ? { choiceExplanations } : {}) } as Question
  })
  if (new Set(questions.map(question => question.id)).size !== questions.length) throw new Error('Question ids must be unique.')
  if (exam.hideOptionsUntilWork !== undefined && typeof exam.hideOptionsUntilWork !== 'boolean') throw new Error('hideOptionsUntilWork must be true or false.')
  const normalized = keep(exam, ['title', 'subtitle', 'subject', 'pointsPerQuestion', 'hideOptionsUntilWork', 'studyGuide', 'readingReferences']) as unknown as Omit<Exam, 'mode'>
  const mode = exam.mode === 'feedback' ? 'feedback' : 'washback'
  return { ...normalized, mode, questions }
}
