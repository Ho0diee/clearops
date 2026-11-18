import React, { useState } from 'react';
import { Check, Compass, Edit3 } from 'lucide-react';
import { Badge, Button, Card, CardBody, CardHeader } from '../../components/ui';
import { useOpsStore } from '../../store/opsStore';
import type { WhyCategory } from '../../types/schema';

const CATS: WhyCategory[] = ['Family', 'School', 'Organization', 'Health'];

/** Baseline Responsibilities are grounded in these four Why statements. */
export const WhyAnchorsCard: React.FC = () => {
  const { state, actions } = useOpsStore();
  const [editing, setEditing] = useState<WhyCategory | null>(null);
  const [draft, setDraft] = useState('');

  return (
    <Card>
      <CardHeader
        title={
          <span className="ops-row">
            <Compass size={16} />
            <span>Baseline Whys</span>
          </span>
        }
        subtitle="Every baseline responsibility on your calendar is tied to one of these."
      />
      <CardBody flush>
        <div className="ui-divider-list">
          {CATS.map((cat) => {
            const count = state.blocks.filter((b) => b.kind === 'baseline' && b.whyCategory === cat).length;
            const isEditing = editing === cat;
            return (
              <div key={cat} className="today-row" style={{ alignItems: 'flex-start' }}>
                <div className="ops-stack-xs" style={{ flex: 1, minWidth: 0 }}>
                  <div className="ops-row">
                    <Badge tone="why">Why: {cat}</Badge>
                    <span className="ui-section-meta">{count} on calendar</span>
                  </div>
                  {isEditing ? (
                    <form
                      className="ops-row"
                      onSubmit={(e) => {
                        e.preventDefault();
                        if (draft.trim()) actions.updateWhyStatement(cat, draft.trim());
                        setEditing(null);
                      }}
                    >
                      <input
                        className="ui-input"
                        style={{ flex: 1, minWidth: 0 }}
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        autoFocus
                      />
                      <Button type="submit" variant="primary" size="sm" aria-label="Save">
                        <Check size={14} />
                      </Button>
                    </form>
                  ) : (
                    <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>
                      {state.whyStatements[cat]}
                    </span>
                  )}
                </div>
                {!isEditing && (
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label={`Edit ${cat} why`}
                    onClick={() => {
                      setEditing(cat);
                      setDraft(state.whyStatements[cat]);
                    }}
                  >
                    <Edit3 size={14} />
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      </CardBody>
    </Card>
  );
};
