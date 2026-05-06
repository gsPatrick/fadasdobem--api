const { syncEmailPendingReviewFlags } = require('./auth.service');

/**
 * JOB R7 — elevação de marcação para contas há +7 dias sem confirmação de e-mail.
 */
function scheduleEmailPendingReviewJob() {
  const tick = () =>
    syncEmailPendingReviewFlags().catch(() => {
      /* evita derrubar o processo; logs podem acrescentarse em produção */
    });
  tick();
  return setInterval(tick, 6 * 60 * 60 * 1000);
}

module.exports = {
  scheduleEmailPendingReviewJob,
};
