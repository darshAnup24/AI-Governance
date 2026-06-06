import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import {
  Card, Button, Badge, Input, EmptyState, StatusPill, SectionLabel, fadeInUp, stagger,
} from '@airlock/shared-ui'
import { governanceApi } from '@airlock/shared-ui'
import { useAuth } from '../../contexts/AuthContext'
import {
  ArrowLeft, MessageSquare, User, AlertTriangle, Clock,
  Flag, Target, Paperclip, Send, Plus,
} from 'lucide-react'

function TimelineEvent({ event }: { event: any }) {
  const iconMap: Record<string, any> = {
    CREATED: Flag,
    STATUS_CHANGE: AlertTriangle,
    ASSIGNED: User,
    ESCALATED: Target,
    COMMENT_ADDED: MessageSquare,
    COMMENT_DELETED: MessageSquare,
    EVIDENCE_ADDED: Paperclip,
    EVIDENCE_REMOVED: Paperclip,
  }
  const Icon = iconMap[event.eventType] || Clock
  const time = new Date(event.createdAt).toLocaleString()

  return (
    <div className="flex gap-3 py-3">
      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-[var(--muted)] flex items-center justify-center">
        <Icon className="w-4 h-4 text-[var(--muted-foreground)]" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-[var(--foreground)]">
          <span className="font-medium">{event.eventType?.replace('_', ' ')}</span>
        </p>
        {event.payload && Object.keys(event.payload).length > 0 && (
          <p className="text-xs text-[var(--muted-foreground)] mt-0.5">{JSON.stringify(event.payload)}</p>
        )}
        <p className="text-xs text-[var(--muted-foreground)]/50 mt-0.5">{time}</p>
      </div>
    </div>
  )
}

export default function IncidentDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const [newComment, setNewComment] = useState('')
  const [showAssignModal, setShowAssignModal] = useState(false)
  const [assignUserId, setAssignUserId] = useState('')
  const [showEvidenceModal, setShowEvidenceModal] = useState(false)
  const [evidenceType, setEvidenceType] = useState('note')
  const [evidenceContent, setEvidenceContent] = useState('')

  const { data: incident, isLoading } = useQuery({
    queryKey: ['incident', id],
    queryFn: () => governanceApi.get(`/incidents/${id}`).then(r => r.data),
    enabled: !!id,
  })

  const { data: users } = useQuery({
    queryKey: ['org-users'],
    queryFn: () => governanceApi.get('/users').then(r => r.data),
  })

  const statusMutation = useMutation({
    mutationFn: (status: string) => governanceApi.patch(`/incidents/${id}/status`, { status }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['incident', id] }),
  })

  const assignMutation = useMutation({
    mutationFn: () => governanceApi.post(`/incidents/${id}/assign`, { userId: assignUserId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['incident', id] })
      setShowAssignModal(false)
    },
  })

  const commentMutation = useMutation({
    mutationFn: () => governanceApi.post(`/incidents/${id}/comments`, { content: newComment }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['incident', id] })
      setNewComment('')
    },
  })

  const evidenceMutation = useMutation({
    mutationFn: () => governanceApi.post(`/incidents/${id}/evidence`, { type: evidenceType, content: evidenceContent }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['incident', id] })
      setShowEvidenceModal(false)
      setEvidenceContent('')
    },
  })

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-pulse space-y-4 w-full max-w-md">
          <div className="h-8 bg-[var(--muted)] rounded-xl w-3/4" />
          <div className="h-4 bg-[var(--muted)] rounded-xl w-1/2" />
        </div>
      </div>
    )
  }

  if (!incident) {
    return (
      <Card>
        <EmptyState
          icon={<AlertTriangle className="w-8 h-8" />}
          title="Incident not found"
          description="This incident may have been deleted or you don't have access."
          action={<Button onClick={() => navigate('/governance/incidents')}>Back to Incidents</Button>}
        />
      </Card>
    )
  }

  const statusFlow = ['OPEN', 'ACKNOWLEDGED', 'INVESTIGATING', 'CONTAINED', 'RESOLVED_CLOSED', 'FALSE_POSITIVE']
  const currentIdx = statusFlow.indexOf(incident.status)
  const nextStatus = currentIdx < statusFlow.length - 1 ? statusFlow[currentIdx + 1] : null

  return (
    <motion.div initial="hidden" animate="visible" variants={stagger} className="space-y-8 max-w-5xl">
      <motion.div variants={fadeInUp} className="flex items-center gap-4">
        <button onClick={() => navigate('/governance/incidents')} className="p-2 text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--muted)] rounded-lg transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 style={{ fontFamily: 'var(--font-display)' }} className="text-2xl text-[var(--foreground)]">{incident.title}</h1>
            <Badge variant={incident.severity === 'CRITICAL' ? 'danger' : incident.severity === 'HIGH' ? 'warning' : 'info'}>{incident.severity}</Badge>
            <StatusPill status={incident.status.toLowerCase()} />
          </div>
          <p className="text-sm text-[var(--muted-foreground)] mt-2">Created {new Date(incident.createdAt).toLocaleString()}</p>
        </div>
      </motion.div>

      <motion.div variants={fadeInUp} className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card title="Description">
            <p className="text-sm text-[var(--muted-foreground)]">{incident.description || 'No description provided.'}</p>
          </Card>

          <Card
            title="Evidence"
            action={
              <Button size="sm" variant="outline" icon={<Plus className="w-3.5 h-3.5" />} onClick={() => setShowEvidenceModal(true)}>
                Add Evidence
              </Button>
            }
          >
            {incident.evidence && incident.evidence.length > 0 ? (
              <div className="space-y-3">
                {incident.evidence.map((item: any) => (
                  <div key={item.id} className="flex items-start gap-3 p-3 rounded-xl bg-[var(--muted)] border border-[var(--border)]">
                    <Paperclip className="w-4 h-4 text-[var(--muted-foreground)] mt-0.5" />
                    <div className="flex-1">
                      <p className="text-sm text-[var(--foreground)]">{item.content}</p>
                      <p className="text-xs text-[var(--muted-foreground)] mt-1">{item.type} · {item.label}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-[var(--muted-foreground)]">No evidence attached yet.</p>
            )}
          </Card>

          <Card title="Timeline">
            {incident.events?.length > 0 ? (
              <div className="divide-y divide-[var(--border)]">
                {incident.events.map((event: any) => (
                  <TimelineEvent key={event.id} event={event} />
                ))}
              </div>
            ) : (
              <p className="text-sm text-[var(--muted-foreground)]">No timeline events.</p>
            )}
          </Card>

          <Card title="Comments">
            <div className="space-y-4 mb-4">
              {incident.comments?.length > 0 ? (
                incident.comments.map((comment: any) => (
                  <div key={comment.id} className="flex gap-3 p-3 rounded-xl bg-[var(--muted)] border border-[var(--border)]">
                    <div className="w-7 h-7 rounded-full bg-[var(--accent)]/10 border border-[var(--accent)]/20 flex items-center justify-center flex-shrink-0">
                      <span className="text-xs font-medium text-[var(--accent)]">{comment.user?.name?.charAt(0) || '?'}</span>
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-medium text-[var(--foreground)]">{comment.user?.name || 'Unknown'}</span>
                        <span className="text-xs text-[var(--muted-foreground)]">{new Date(comment.createdAt).toLocaleString()}</span>
                      </div>
                      <p className="text-sm text-[var(--muted-foreground)]">{comment.content}</p>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-sm text-[var(--muted-foreground)]">No comments yet.</p>
              )}
            </div>
            <div className="flex gap-3">
              <Input
                placeholder="Add a comment..."
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                className="flex-1"
              />
              <Button
                onClick={() => commentMutation.mutate()}
                disabled={!newComment.trim() || commentMutation.isPending}
                icon={<Send className="w-4 h-4" />}
              >
                Send
              </Button>
            </div>
          </Card>
        </div>

        <div className="space-y-6">
          <Card title="Details" subtitle="Incident metadata">
            <div className="space-y-4">
              {[
                { label: 'Status', value: <StatusPill status={incident.status.toLowerCase()} /> },
                { label: 'Severity', value: <Badge variant={incident.severity === 'CRITICAL' ? 'danger' : incident.severity === 'HIGH' ? 'warning' : 'info'}>{incident.severity}</Badge> },
                { label: 'Assignee', value: incident.assignee?.name || 'Unassigned' },
                { label: 'Escalated To', value: incident.escalation?.name || '—' },
              ].map((item) => (
                <div key={item.label} className="flex justify-between text-sm">
                  <span className="text-[var(--muted-foreground)]">{item.label}</span>
                  <span className="text-[var(--foreground)] font-medium">{item.value}</span>
                </div>
              ))}
              {incident.model && (
                <div className="flex justify-between text-sm">
                  <span className="text-[var(--muted-foreground)]">Model</span>
                  <span className="text-[var(--foreground)] font-medium">{incident.model.name}</span>
                </div>
              )}
              {incident.resolution && (
                <div className="pt-3 border-t border-[var(--border)]">
                  <p className="text-xs text-[var(--muted-foreground)] mb-1">Resolution</p>
                  <p className="text-sm text-[var(--foreground)]">{incident.resolution}</p>
                </div>
              )}
            </div>
          </Card>

          <Card title="Actions">
            <div className="space-y-3">
              {nextStatus && (
                <Button
                  variant="secondary"
                  className="w-full"
                  size="sm"
                  loading={statusMutation.isPending}
                  onClick={() => statusMutation.mutate(nextStatus)}
                >
                  Move to {nextStatus.replace('_', ' ')}
                </Button>
              )}
              <Button
                variant="outline"
                className="w-full"
                size="sm"
                onClick={() => setShowAssignModal(true)}
                icon={<User className="w-4 h-4" />}
              >
                Assign
              </Button>
            </div>
          </Card>
        </div>
      </motion.div>

      {/* Assign Modal */}
      {showAssignModal && (
        <>
          <div className="fixed inset-0 bg-black/30 z-40" onClick={() => setShowAssignModal(false)} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.2 }}
              className="w-full max-w-sm bg-white rounded-2xl border border-[var(--border)] shadow-xl p-6"
            >
              <h3 className="text-lg font-semibold text-[var(--foreground)] mb-4">Assign Incident</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-[var(--foreground)] mb-1.5">Assign to</label>
                  <select
                    value={assignUserId}
                    onChange={(e) => setAssignUserId(e.target.value)}
                    className="h-12 w-full rounded-xl border border-[var(--border)] bg-transparent px-4 text-sm text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)] focus:ring-offset-2"
                  >
                    <option value="">Select a user...</option>
                    {(users?.users || users || []).map((u: any) => (
                      <option key={u.id} value={u.id}>{u.name} ({u.email})</option>
                    ))}
                  </select>
                </div>
                <Button onClick={() => assignMutation.mutate()} disabled={!assignUserId} loading={assignMutation.isPending} className="w-full">
                  Assign
                </Button>
              </div>
            </motion.div>
          </div>
        </>
      )}

      {/* Evidence Modal */}
      {showEvidenceModal && (
        <>
          <div className="fixed inset-0 bg-black/30 z-40" onClick={() => setShowEvidenceModal(false)} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.2 }}
              className="w-full max-w-sm bg-white rounded-2xl border border-[var(--border)] shadow-xl p-6"
            >
              <h3 className="text-lg font-semibold text-[var(--foreground)] mb-4">Add Evidence</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-[var(--foreground)] mb-1.5">Type</label>
                  <select
                    value={evidenceType}
                    onChange={(e) => setEvidenceType(e.target.value)}
                    className="h-12 w-full rounded-xl border border-[var(--border)] bg-transparent px-4 text-sm text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)] focus:ring-offset-2"
                  >
                    <option value="note">Note</option>
                    <option value="log">Log Entry</option>
                    <option value="screenshot">Screenshot</option>
                    <option value="report">Report</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <Input label="Content" value={evidenceContent} onChange={(e) => setEvidenceContent(e.target.value)} placeholder="Describe the evidence..." />
                <Button onClick={() => evidenceMutation.mutate()} disabled={!evidenceContent.trim()} loading={evidenceMutation.isPending} className="w-full">
                  Add Evidence
                </Button>
              </div>
            </motion.div>
          </div>
        </>
      )}
    </motion.div>
  )
}
