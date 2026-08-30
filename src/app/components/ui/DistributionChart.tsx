type DistributionChartProps = {
  buckets: readonly string[];
  distribution: Record<string, number>;
  attemptTerm: string;
  attemptTermSingular: string;
};

function bucketValue(distribution: Record<string, number>, bucket: string) {
  if (!bucket.endsWith("+")) return distribution[bucket] ?? 0;

  const minimum = Number(bucket.slice(0, -1));
  return Object.entries(distribution).reduce((total, [key, value]) => {
    const numericKey = Number(key.endsWith("+") ? key.slice(0, -1) : key);
    return total + (Number.isInteger(numericKey) && numericKey >= minimum ? value : 0);
  }, 0);
}

export function DistributionChart({
  buckets,
  distribution,
  attemptTerm,
  attemptTermSingular,
}: DistributionChartProps) {
  const values = buckets.map((bucket) => [bucket, bucketValue(distribution, bucket)] as const);
  const largestBucket = Math.max(1, ...values.map(([, value]) => value));
  const totalWins = values.reduce((total, [, value]) => total + value, 0);

  return (
    <div className="distribution" aria-label={`Win distribution by number of ${attemptTerm}`}>
      {values.map(([bucket, value]) => {
        const width = totalWins ? (value / totalWins) * 100 : 0;
        const isHot = value > 0 && value === largestBucket;
        const attemptLabel = bucket === "1" ? attemptTermSingular : attemptTerm;
        return (
          <div className="distribution__row" data-hot={isHot || undefined} key={bucket}>
            <span className="distribution__label">{bucket}</span>
            <div
              aria-label={`${value} wins in ${bucket} ${attemptLabel}`}
              aria-valuemax={totalWins}
              aria-valuemin={0}
              aria-valuenow={value}
              className="distribution__track"
              role="progressbar"
            >
              <i className="distribution__fill" style={{ width: `${width}%` }} />
            </div>
            <strong>{value}</strong>
          </div>
        );
      })}
    </div>
  );
}
