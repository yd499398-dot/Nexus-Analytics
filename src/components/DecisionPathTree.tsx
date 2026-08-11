import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Play, ArrowDown, TrendingDown, TrendingUp, Flag } from 'lucide-react';
import { DecisionStep } from '../types';
import { useLanguage } from './LanguageContext';

interface DecisionPathTreeProps {
  decisionPath: DecisionStep[];
  riskLevel: 'Low' | 'Medium' | 'High' | null;
  riskScore?: number | null;
}

// Pulls a short "category" label out of a condition string, e.g.
// "Job Involvement is at or below 3.5" -> "Job Involvement"
const extractCategory = (condition: string) => {
  const match = condition.match(/^(.*?)\s+(is not|is at or below|is at or above|is|has|was)\b/i);
  return (match ? match[1] : condition).trim();
};

// Heuristic on the outcome text to decide whether this branch trended toward
// lower or higher risk, so we can color-code it consistently with the rest
// of the app (emerald = lower risk, rose = higher risk).
const branchDirection = (outcome: string): 'down' | 'up' | 'neutral' => {
  const o = outcome.toLowerCase();
  if (o.includes('lower') || o.includes('reduced') || o.includes('stable') || o.includes('retain')) return 'down';
  if (o.includes('higher') || o.includes('elevated') || o.includes('increase')) return 'up';
  return 'neutral';
};

const riskTheme = (risk: string | null) => {
  if (risk === 'High') return { text: 'text-rose-600 dark:text-rose-400', bg: 'bg-rose-50 dark:bg-rose-950/40', border: 'border-rose-200 dark:border-rose-900/50', dot: 'bg-rose-500' };
  if (risk === 'Medium') return { text: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-950/40', border: 'border-amber-200 dark:border-amber-900/50', dot: 'bg-amber-500' };
  if (risk === 'Low') return { text: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-950/40', border: 'border-emerald-200 dark:border-emerald-900/50', dot: 'bg-emerald-500' };
  return { text: 'text-slate-500', bg: 'bg-slate-50 dark:bg-slate-900', border: 'border-slate-200 dark:border-slate-700', dot: 'bg-slate-400' };
};

export default function DecisionPathTree({ decisionPath, riskLevel, riskScore }: DecisionPathTreeProps) {
  const { t } = useLanguage();
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);

  // Reset / auto-select the first node whenever a fresh analysis comes in.
  useEffect(() => {
    setSelectedIdx(decisionPath.length > 0 ? 0 : null);
  }, [decisionPath]);

  const theme = riskTheme(riskLevel);

  if (decisionPath.length === 0) {
    return (
      <div className="w-full h-full min-h-[420px] flex flex-col items-center justify-center text-center px-6">
        <div className="w-12 h-12 rounded-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center mb-4">
          <Play className="w-5 h-5 text-slate-400" />
        </div>
        <div className="text-slate-400 text-xs uppercase tracking-widest whitespace-pre-line">
          {t('awaiting_seq')}
        </div>
      </div>
    );
  }

  return (
    <div className="w-full py-4 px-4">
      <div className="flex flex-col items-center min-w-[260px] max-w-md mx-auto">

        {/* Root node */}
        <div className="flex flex-col items-center px-4 py-2 rounded-xl border border-indigo-200 dark:border-indigo-900/50 bg-indigo-50 dark:bg-indigo-950/40 shadow-sm">
          <span className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-widest">
            {t('subject_profile')}
          </span>
          <span className="text-[11px] text-indigo-500 dark:text-indigo-300 font-medium mt-0.5">Assessment Start</span>
        </div>

        <ArrowDown className="w-3.5 h-3.5 text-slate-300 dark:text-slate-600 my-1" />

        {decisionPath.map((step, idx) => {
          const isSelected = selectedIdx === idx;
          const dir = branchDirection(step.outcome);
          const category = extractCategory(step.condition);

          return (
            <div key={idx} className="w-full flex flex-col items-center">
              <motion.button
                type="button"
                onClick={() => setSelectedIdx(isSelected ? null : idx)}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.05 }}
                className={`w-full text-left rounded-xl border px-3.5 py-2.5 transition-all shadow-sm ${
                  isSelected
                    ? 'border-indigo-400 dark:border-indigo-500 bg-indigo-50/60 dark:bg-indigo-900/30 shadow-md'
                    : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-indigo-300 dark:hover:border-indigo-700'
                }`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span className={`text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full border ${
                    isSelected
                      ? 'bg-indigo-600 text-white border-indigo-600'
                      : 'bg-slate-100 dark:bg-slate-900 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700'
                  }`}>
                    {step.step}
                  </span>
                  <span className={`text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full border ${theme.bg} ${theme.text} ${theme.border} opacity-80`}>
                    {category}
                  </span>
                </div>

                <div className="text-[11px] font-mono text-slate-800 dark:text-slate-200 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1 mb-1.5 break-words">
                  {step.condition}
                </div>

                <div className="flex items-center text-[11px] text-slate-600 dark:text-slate-300">
                  {dir === 'down' && <TrendingDown className="w-3 h-3 mr-1.5 shrink-0 text-emerald-500" />}
                  {dir === 'up' && <TrendingUp className="w-3 h-3 mr-1.5 shrink-0 text-rose-500" />}
                  {dir === 'neutral' && <ArrowDown className="w-3 h-3 mr-1.5 shrink-0 text-slate-400 -rotate-90" />}
                  <span className="leading-snug">{step.outcome}</span>
                </div>
              </motion.button>

              <ArrowDown className="w-3.5 h-3.5 text-slate-300 dark:text-slate-600 my-1" />
            </div>
          );
        })}

        {/* Terminal / leaf node */}
        <AnimatePresence>
          {riskLevel && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className={`flex flex-col items-center px-5 py-3 rounded-xl border shadow-md ${theme.bg} ${theme.border}`}
            >
              <div className="flex items-center space-x-2">
                <Flag className={`w-3.5 h-3.5 ${theme.text}`} />
                <span className={`text-[10px] font-bold uppercase tracking-widest ${theme.text}`}>
                  Terminal Node
                </span>
              </div>
              <div className={`text-lg font-display font-bold mt-1 ${theme.text}`}>
                {riskLevel} Risk
                {typeof riskScore === 'number' && (
                  <span className="text-xs font-medium opacity-60 ml-1.5">({riskScore}/100)</span>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
