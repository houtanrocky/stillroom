import { useState } from 'react'
import { ArrowLeft } from 'lucide-react'
import type { topicStatistics } from './questionHistory'

export default function TopicStatistics({ topics, ready, onBack, onPractice }: {
  topics: ReturnType<typeof topicStatistics>
  ready: boolean
  onBack: () => void
  onPractice: (topic: string) => void
}) {
  const [topic, setTopic] = useState('')
  const visibleTopics = topic ? topics.filter(item => item.key === topic) : topics

  return <main className="exam-library">
    <button className="back-link" onClick={onBack}><ArrowLeft size={15} /> Exams</button>
    <h1>Topic statistics</h1>
    {topics.length === 0 ? <p>{ready ? 'Start an exam to see your progress by topic.' : 'Loading your exam history...'}</p> : <>
      <p>Accuracy is based on graded answers. Each saved attempt counts separately, including exams in progress.</p>
      <label className="topic-filter">Filter by topic
        <select value={topic} onChange={event => setTopic(event.target.value)}>
          <option value="">All topics</option>
          {topics.map(item => <option key={item.key} value={item.key}>{item.topic}</option>)}
        </select>
      </label>
      {visibleTopics.map(item => {
        const graded = item.correct + item.review
        return <article key={item.key}>
          <h2>{item.topic}</h2>
          <p>{graded ? `${Math.round(item.correct / graded * 100)}% accuracy (${item.correct} of ${graded} graded)` : 'No graded answers yet'}</p>
          <dl className="topic-metrics">
            <div><dt>Correct</dt><dd>{item.correct}</dd></div>
            <div><dt>Needs review</dt><dd>{item.review}</dd></div>
            <div><dt>Ungraded</dt><dd>{item.ungraded}</dd></div>
            <div><dt>Unanswered</dt><dd>{item.unanswered}</dd></div>
            <div><dt>Used hints</dt><dd>{item.hinted}</dd></div>
          </dl>
          {item.practice > 0 && <button className="secondary-button" onClick={() => onPractice(item.key)}>Practice from mistakes</button>}
        </article>
      })}
    </>}
  </main>
}
