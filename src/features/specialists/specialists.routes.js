const { Router } = require('express');
const specialistsController = require('./specialists.controller');

const router = Router();

router.get('/', specialistsController.list);

module.exports = router;
