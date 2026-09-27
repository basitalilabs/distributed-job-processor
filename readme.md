# Distributed Background Job Processing System

A backend system that runs background jobs across multiple workers. Jobs are stored in PostgreSQL, and workers claim them using row-level locking, so the same job is never picked up by two workers at once. Failed jobs are retried with increasing delays, and jobs are not lost if a worker crashes.