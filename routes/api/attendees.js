const express = require('express')
const router= express.Router()
const attendeesCtrl = require('../../controllers/api/attendees')


// GET /api/attendees
router.get('/', attendeesCtrl.index)


// SHOW /api/attendees/user
router.get('/user', attendeesCtrl.show)

// SHOWALL /api/attendees/:id
router.get('/:id', attendeesCtrl.showAll)



// POST /api/attendees
router.post('/', attendeesCtrl.create)


// PATCH /api/attendees/:id
router.patch('/:id', attendeesCtrl.patch)


// DELETE /api/attendees/:id
router.delete('/:id', attendeesCtrl.remove)



module.exports = router