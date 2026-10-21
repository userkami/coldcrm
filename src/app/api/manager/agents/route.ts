import { requireRoleApi } from "@/lib/auth";
import { getRepository } from "@/lib/repo";
import type { Role } from "@/lib/types";

export async function GET() {
  const auth = await requireRoleApi("MANAGER");
  if ("response" in auth) return auth.response;

  const repo = await getRepository();
  const users = await repo.listUsers();

  // The PIN is never sent to the browser.
  return Response.json({
    users: users.map(({ pin: _pin, ...rest }) => rest),
  });
}

export async function POST(request: Request) {
  const auth = await requireRoleApi("MANAGER");
  if ("response" in auth) return auth.response;

  let body: {
    email?: string;
    name?: string;
    pin?: string;
    role?: Role;
    active?: boolean;
    action?: "create" | "update" | "deactivate" | "reset-pin";
  };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }

  const email = (body.email ?? "").trim().toLowerCase();
  if (!email || !email.includes("@")) {
    return Response.json({ error: "Enter a valid email address." }, { status: 400 });
  }

  const repo = await getRepository();
  const existing = await repo.getUser(email);

  // Guard the last manager: the app must never be left with nobody able to
  // administer it.
  const managers = (await repo.listUsers()).filter(
    (u) => u.role === "MANAGER" && u.active,
  );
  const isDemotingLastManager =
    existing?.role === "MANAGER" &&
    (body.role === "AGENT" || body.action === "deactivate");
  if (isDemotingLastManager && managers.length <= 1) {
    return Response.json(
      { error: "You cannot remove the only active manager account." },
      { status: 400 },
    );
  }

  const action = body.action ?? (existing ? "update" : "create");

  if (action === "deactivate") {
    await repo.upsertUser({
      email,
      name: existing?.name ?? email,
      pin: existing?.pin ?? "",
      role: existing?.role ?? "AGENT",
      active: false,
    });
    // Free any lead this agent was holding so it returns to the queue.
    const leads = await repo.listLeads();
    for (const lead of leads) {
      if (lead.assignedTo === email && lead.lockToken) {
        await repo.releaseLock(lead.id);
      }
    }
    return Response.json({ ok: true });
  }

  if (action === "reset-pin") {
    const pin = (body.pin ?? "").trim();
    if (!/^\d{4,8}$/.test(pin)) {
      return Response.json(
        { error: "PIN must be 4 to 8 digits." },
        { status: 400 },
      );
    }
    if (!existing) {
      return Response.json({ error: "No such agent." }, { status: 404 });
    }
    await repo.upsertUser({ ...existing, pin });
    return Response.json({ ok: true });
  }

  // create / update
  const pin = (body.pin ?? "").trim();
  const creating = !existing;
  if (creating && !/^\d{4,8}$/.test(pin)) {
    return Response.json(
      { error: "PIN must be 4 to 8 digits." },
      { status: 400 },
    );
  }

  const role: Role = body.role === "MANAGER" ? "MANAGER" : "AGENT";
  await repo.upsertUser({
    email,
    name: (body.name ?? existing?.name ?? email).trim(),
    pin: creating || pin ? pin : (existing?.pin ?? ""),
    role,
    active: body.active ?? existing?.active ?? true,
  });

  return Response.json({ ok: true });
}

export async function DELETE(request: Request) {
  const auth = await requireRoleApi("MANAGER");
  if ("response" in auth) return auth.response;

  const email = new URL(request.url).searchParams.get("email")?.trim().toLowerCase();
  if (!email) {
    return Response.json({ error: "Missing email." }, { status: 400 });
  }
  if (email === auth.session.email) {
    return Response.json(
      { error: "You cannot remove your own account." },
      { status: 400 },
    );
  }

  const repo = await getRepository();
  const existing = await repo.getUser(email);
  if (!existing) {
    return Response.json({ error: "No such agent." }, { status: 404 });
  }

  const managers = (await repo.listUsers()).filter(
    (u) => u.role === "MANAGER" && u.active,
  );
  if (existing.role === "MANAGER" && managers.length <= 1) {
    return Response.json(
      { error: "You cannot remove the only active manager account." },
      { status: 400 },
    );
  }

  await repo.removeUser(email);

  // Free any lead the removed agent was holding.
  const leads = await repo.listLeads();
  for (const lead of leads) {
    if (lead.assignedTo === email && lead.lockToken) {
      await repo.releaseLock(lead.id);
    }
  }

  return Response.json({ ok: true });
}
