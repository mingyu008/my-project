package com.myproject.schedule;

import com.myproject.auth.service.AuthenticatedUser;
import com.myproject.user.domain.Role;

/**
 * Schedule and reward authorization rules (DECISIONS D-029, D-035). The server-side source of truth; UI flags only mirror it.
 */
final class ScheduleAccess {

    private ScheduleAccess() {
    }

    static boolean isAdmin(AuthenticatedUser current) {
        return current.roles().contains(Role.ADMIN);
    }

    /** CONFIRMER or ADMIN: may manage rewards and read every schedule. */
    static boolean isRewardManager(AuthenticatedUser current) {
        return isAdmin(current) || current.roles().contains(Role.CONFIRMER);
    }

    static boolean canViewAll(AuthenticatedUser current) {
        return isRewardManager(current);
    }

    static boolean canView(Schedule schedule, AuthenticatedUser current) {
        return canViewAll(current) || schedule.isCreatedBy(current.id()) || schedule.isAssignedTo(current.id())
                || schedule.isPublicSchedule();
    }

    /** Editing the schedule itself stays with the creator and ADMIN (CONFIRMER only reads). */
    static boolean canModify(Schedule schedule, AuthenticatedUser current) {
        return isAdmin(current) || schedule.isCreatedBy(current.id());
    }
}
