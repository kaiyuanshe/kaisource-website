# Domestic startup repair, October 12, 2026

The domestic API retains its historical interface and registration behavior.
The hotfix is based on the actual Azure checkout
`983c03de22073681a9390f38583153841fd81c66`, not the overseas API branch. It changes
only `models/init.go` and `main.go`; `legacy-startup-983c03.patch` contains the
exact reviewed source difference.

Serving no longer performs AutoMigrate, permission initialization or category
seeding. `-mode=migrate` is an explicit operator command requiring an appropriate
administrative database role. Production continues to use the limited application
role and the existing Neon connection.

The existing domestic scheduler runs by default. For isolated testing only,
`KAISOURCE_SCHEDULER_ENABLED=false` suppresses it. Optional host/port overrides
permit a loopback rehearsal without taking over the production listener.

The Linux amd64 binary was built with CGO disabled. Its SHA256 is
`f32199be166f7e0aa0e052a8ce574c93afa2e31dd47e3c76f4ad51045bf8a263`.
An isolated production-derived Neon branch verified startup in about 1.8 seconds,
public API reads, anonymous write denial, unchanged table data and unchanged
production PID. The test branch expires on October 13, 2026 at 08:00 UTC.

Activation uses `/etc/systemd/system/kaiyuanshe.service.d/90-startup-repair.conf`
to select `/home/azureuser/kaisource-api/repair-20261012/domestic-server`. The old
`/home/azureuser/website/kaiyuanshe/app` binary remains intact. Production public
responses were identical before/after activation; no startup DDL errors remained,
the domestic scheduler started, and the sidecar PID and DB configuration stayed
unchanged. Receipts: `../../qa-artifacts/repair-20261012/`.

An application-only rollback removes this drop-in, reloads systemd, and restarts
only `kaiyuanshe.service`. It retains the Neon database connection. Never revert
to the frozen Azure database snapshot without reverse synchronization.
