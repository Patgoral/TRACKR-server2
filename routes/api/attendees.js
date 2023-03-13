const express = require('express')
const router= express.Router()
const attendeesCtrl = require('../../controllers/api/attendees')
const multer = require('multer')

// GET /api/attendees
router.get('/', attendeesCtrl.index)


// SHOW /api/attendees/user
router.get('/user', attendeesCtrl.show)

// SHOWALL /api/attendees/:id
router.get('/:id', attendeesCtrl.showAll)



// POST /api/attendees
router.route('/')
.post(multer({ dest: 'temp/', limits: { fieldSize: 8 * 1024 * 1024 } }).single(
    'image'
  ), attendeesCtrl.create)


// PATCH /api/attendees/:id
router.patch('/:id', attendeesCtrl.patch)


// DELETE /api/attendees/:id
router.delete('/:id', attendeesCtrl.remove)



module.exports = router