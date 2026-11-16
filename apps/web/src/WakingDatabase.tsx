import { useEffect, useState } from "react";

/** How long the first session check may take before the visitor is told why. A warm database answers well inside it. */
export const WAKING_DELAY_MS = 1500;

/**
 * What the showcase shows while its first request waits for Aurora to resume from a pause, about 15
 * seconds (ADR 0015). It says so, so the wait reads as intended and not as a broken page.
 */
export const WakingDatabase = () => {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setShown(true), WAKING_DELAY_MS);
    return () => clearTimeout(timer);
  }, []);
  if (!shown) return null;
  return (
    <div className="waking" role="status">
      <h1>Just 10 seconds.</h1>
      <p className="lead">The showcase database is loading...</p>
      <p className="waking-note">
        ibbun is fully serverless on AWS: Lambda answers each request, Aurora Serverless v2 keeps the data and pauses
        when nobody is studying, and S3 and CloudFront serve the app. This first visit is waking the database up.
      </p>
    </div>
  );
};
