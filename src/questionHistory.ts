import type { RunData } from './App'
import type { Question } from './exam'

type Outcome = 'correct' | 'needs review' | 'ungraded' | 'unanswered'

export function questionHistory(attempts: RunData[]) {
  return attempts.flatMap(attempt => {
    const committed = new Set(attempt.committed)
    return attempt.exam.questions.map(question => {
      const id = question.id
      const topic = (typeof question.topic === 'string' ? question.topic.trim() : '') || attempt.exam.subject?.trim() || 'Unlabeled'
      const multipleChoice = question.choices.length > 0
      const submitted = committed.has(id)
      const choice = question.choices.find(option => option.id === attempt.answers[id])
      const response = attempt.responses[id]
      let outcome: Outcome = 'unanswered'
      if (multipleChoice && choice && (submitted || attempt.mode === 'feedback')) {
        outcome = choice.id === question.answer ? 'correct' : 'needs review'
      }
      if (!multipleChoice && submitted && typeof response === 'string' && response.trim()) {
        const grade = attempt.selfGrades[id]
        outcome = grade === 'met' ? 'correct' : grade === 'review' ? 'needs review' : 'ungraded'
      }
      const skipped = multipleChoice && submitted && attempt.answers[id] === ''
      const hintsUsed = attempt.hints[id] ?? 0
      return {
        key: JSON.stringify([attempt.id, id]),
        topic,
        topicKey: topic.normalize('NFKC').replace(/\s+/g, ' ').toLowerCase(),
        examTitle: attempt.exam.title,
        question,
        outcome,
        hintsUsed,
        skipped,
        practice: outcome === 'needs review' || skipped || hintsUsed > 0,
        learnerAnswer: multipleChoice ? choice?.text : response,
        writtenWork: attempt.work[id],
      }
    })
  })
}

export type QuestionHistoryEntry = ReturnType<typeof questionHistory>[number]

export function topicStatistics(history: QuestionHistoryEntry[]) {
  const topics = new Map<string, { topic: string; correct: number; review: number; ungraded: number; unanswered: number; hinted: number; practice: number }>()
  for (const entry of history) {
    const stats = topics.get(entry.topicKey) ?? { topic: entry.topic, correct: 0, review: 0, ungraded: 0, unanswered: 0, hinted: 0, practice: 0 }
    if (entry.outcome === 'needs review') stats.review++
    else stats[entry.outcome]++
    if (entry.hintsUsed > 0) stats.hinted++
    if (entry.practice) stats.practice++
    topics.set(entry.topicKey, stats)
  }
  return Array.from(topics, ([key, stats]) => ({ key, ...stats }))
    .sort((a, b) => a.topic.localeCompare(b.topic))
}

function modelAnswer(question: Question) {
  return question.expectedAnswer ?? question.choices.find(option => option.id === question.answer)?.text
}

export function mistakeSource(entries: QuestionHistoryEntry[]) {
  return entries.map(entry => ({
    topic: entry.topic,
    question: entry.question.prompt,
    outcome: entry.skipped ? 'skipped' : entry.outcome,
    hintsUsed: entry.hintsUsed,
    learnerAnswer: entry.outcome === 'unanswered' ? undefined : entry.learnerAnswer,
    writtenWork: entry.writtenWork,
    modelAnswer: modelAnswer(entry.question),
    explanation: entry.question.explanation,
  }))
}
