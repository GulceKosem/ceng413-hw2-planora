
const test = require("node:test");
const assert = require("node:assert/strict");

const { generateStudyPlan } = require("../src/scheduler");

function futureDate(days = 5) {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + days);

  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0")
  ].join("-");
}

test("generates a valid study plan", () => {
  const result = generateStudyPlan(
    [{ name: "Docker", hours: 4 }],
    futureDate(),
    2
  );

  assert.equal(result.feasible, true);
  assert.equal(result.unscheduledMinutes, 0);

  const scheduled = result.days.flatMap(day => day.sessions);
  assert.equal(
    scheduled.reduce((sum, session) => sum + session.minutes, 0),
    240
  );
});

test("does not exceed daily study capacity", () => {
  const result = generateStudyPlan(
    [{ name: "JavaScript", hours: 10 }],
    futureDate(2),
    2
  );

  for (const day of result.days) {
    const total = day.sessions.reduce(
      (sum, session) => sum + session.minutes,
      0
    );

    assert.ok(total <= 120);
  }

  assert.equal(result.feasible, false);
  assert.equal(result.unscheduledMinutes, 240);
});

test("rejects invalid study hours", () => {
  assert.throws(() => {
    generateStudyPlan(
      [{ name: "Docker", hours: -2 }],
      futureDate(),
      2
    );
  });
});

test("rejects an empty topic list", () => {
  assert.throws(() => {
    generateStudyPlan([], futureDate(), 2);
  });
});
