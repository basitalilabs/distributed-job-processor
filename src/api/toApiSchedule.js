function toApiSchedule(schedule){
    return {
        id : schedule.id,
        name : schedule.name,
        cron : schedule.cron_expression,
        jobType : schedule.job_type,
        payload : schedule.payload,
        enabled : schedule.enabled,
        nextRunAt : schedule.next_run_at,
        lastRunAt : schedule.last_run_at,
        createdAt : schedule.created_at,
        updatedAt : schedule.updated_at
    }
}

module.exports = toApiSchedule;