// utils/access.js

export function addDays(date, days) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

export function isPaidUser(user) {
  const now = new Date();

  return Boolean(
    user &&
      (
        user.subscriptionStatus === "active" ||
        user.premium === true ||
        (user.paidUntil && new Date(user.paidUntil) > now) ||
        (user.premiumExpiresAt && new Date(user.premiumExpiresAt) > now)
      )
  );
}

export function isTrialActive(user) {
  const now = new Date();

  return Boolean(
    user &&
      user.trialActive &&
      user.trialEndDate &&
      new Date(user.trialEndDate) >= now
  );
}

export function getAccessStatus(user) {
  if (isPaidUser(user)) return "active";
  if (isTrialActive(user)) return "trial";
  return "expired";
}

export function getTrialDaysLeft(user) {
  if (!user?.trialEndDate) return 0;

  const now = new Date();
  const end = new Date(user.trialEndDate);
  const diff = end.getTime() - now.getTime();

  if (diff <= 0) return 0;

  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

export async function syncUserAccessState(user) {
  if (!user) return user;

  const now = new Date();
  const accessStatus = getAccessStatus(user);

  if (
    accessStatus === "expired" &&
    user.trialActive === true &&
    user.trialEndDate &&
    new Date(user.trialEndDate) < now
  ) {
    user.trialActive = false;

    if (!user.trialExpiredAt) {
      user.trialExpiredAt = now;
    }
  }

  if (
    user.subscriptionStatus === "active" &&
    user.paidUntil &&
    new Date(user.paidUntil) < now
  ) {
    user.subscriptionStatus = "expired";
  }

  if (
    user.premium === true &&
    user.premiumExpiresAt &&
    new Date(user.premiumExpiresAt) < now
  ) {
    user.premium = false;
  }

  await user.save();
  return user;
}
