class PermanentError extends Error{
    constructor(message){
        super(message);
        this.name = "PermanentError";
    }
};

module.exports = PermanentError;