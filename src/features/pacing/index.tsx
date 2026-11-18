import React, { useState } from 'react';
import { SegmentedControl } from '../../components/ui';
import { GoalPacingSection } from './GoalPacingSection';
import { OffloadRoiSection } from './OffloadRoiSection';

type PacingSectionFilter = 'all' | 'pacing' | 'roi';

export const PacingRoiView: React.FC = () => {
  const [sectionFilter, setSectionFilter] = useState<PacingSectionFilter>('all');

  return (
    <div className="ops-stack-lg">
      <div className="ops-row-between" style={{ flexWrap: 'wrap', gap: '12px' }}>
        <div className="ops-stack-xs" style={{ flex: '1 1 260px', minWidth: 0 }}>
          <h1 className="ui-section-title" style={{ fontSize: 'var(--text-xl)' }}>
            Pacing &amp; Offload ROI
          </h1>
          <span className="ui-section-meta" style={{ whiteSpace: 'normal' }}>
            Spread big goals across days with confidence check-ins, and verify every delegation pays off.
          </span>
        </div>

        <SegmentedControl<PacingSectionFilter>
          ariaLabel="Filter Pacing and ROI sections"
          value={sectionFilter}
          onChange={setSectionFilter}
          options={[
            { value: 'all', label: 'All Sections' },
            { value: 'pacing', label: 'Goal Pacing' },
            { value: 'roi', label: 'Offload ROI' },
          ]}
        />
      </div>

      {(sectionFilter === 'all' || sectionFilter === 'pacing') && <GoalPacingSection />}
      {(sectionFilter === 'all' || sectionFilter === 'roi') && <OffloadRoiSection />}
    </div>
  );
};
