async function createActivityLog(client, data) {
  const { userId, userRole, action, module, targetId, changes, message, req } =
    data;

  await client.query(
    `
    INSERT INTO activity_logs (
      user_id,
      user_role,
      action,
      module,
      target_id,
      changes,
      message,
      ip_address,
      user_agent
    )
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
    `,
    [
      userId,
      userRole,
      action,
      module,
      targetId,
      changes ? JSON.stringify(changes) : null,
      message,
      req.ip,
      req.headers["user-agent"],
    ],
  );
}

module.exports = createActivityLog;
