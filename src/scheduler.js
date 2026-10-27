
function generateStudyPlan(topics, deadline, dailyHours) {
  if (!Array.isArray(topics) || topics.length === 0) {
    throw new Error("At least one study topic is required.");
  }

  if (!Number.isFinite(dailyHours) || dailyHours <= 0 || dailyHours > 24) {
    throw new Error("Daily study hours must be between 0 and 24.");
  }

  const deadlineDate = new Date(`${deadline}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (!Number.isFinite(deadlineDate.getTime()) || deadlineDate < today) {
    throw new Error("Deadline must be today or a future date.");
  }

  const tasks = topics.map((topic) => {
    if (
      typeof topic.name !== "string" ||
      !topic.name.trim() ||
      !Number.isFinite(topic.hours) ||
      topic.hours <= 0
    ) {
      throw new Error("Each topic needs a name and positive study hours.");
    }

    return {
      name: topic.name.trim(),
      remainingMinutes: Math.round(topic.hours * 60)
    };
  });

  const capacityMinutes = Math.floor(dailyHours * 60);

  if (capacityMinutes < 1) {
    throw new Error("Daily capacity must be at least one minute.");
  }

  const days = [];
  let currentDate = new Date(today);

  while (currentDate <= deadlineDate) {
    let freeMinutes = capacityMinutes;
    const sessions = [];

    for (const task of tasks) {
      if (freeMinutes <= 0) break;
      if (task.remainingMinutes <= 0) continue;

      const minutes = Math.min(freeMinutes, task.remainingMinutes);

      sessions.push({
        topic: task.name,
        minutes
      });

      task.remainingMinutes -= minutes;
      freeMinutes -= minutes;
    }

    days.push({
      date: [
        currentDate.getFullYear(),
        String(currentDate.getMonth() + 1).padStart(2, "0"),
        String(currentDate.getDate()).padStart(2, "0")
      ].join("-"),
      sessions
    });

    currentDate.setDate(currentDate.getDate() + 1);
  }

  const unscheduledMinutes = tasks.reduce(
    (total, task) => total + task.remainingMinutes,
    0
  );

  return {
    days,
    unscheduledMinutes,
    feasible: unscheduledMinutes === 0
  };
}

module.exports = { generateStudyPlan };
