const Attendee = require('../../models/attendee')

// INDEX ALL ATTENDEES
async function index(req, res, next) {
	try {
		Attendee.find()
			.then((attendees) => {
				return attendees
					.map((attendee) => attendee)
					.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
			})
			.then((attendees) => {
				res.status(200).json({ attendees: attendees })
			})
	} catch (error) {
		res.status(400).json(error)
	}
}

// SHOW USER ATTENDEES
async function show(req, res, next) {
	try {
		await Attendee.find({ owner: req.user._id })
			.then((attendees) => {
				return attendees.map((attendee) => attendee)
				.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
			})
			.then((attendees) => {
				res.status(200).json({ attendees: attendees })
			})
	} catch (error) {
		res.status(400).json(error)
	}
}

// SHOW ANY ATTENDEES
async function showAll(req, res, next) {
	try {
		await Attendee.findById(req.params.id)
			.then((attendees) => {
				res.status(200).json({ attendees: attendees })
			})
	} catch (error) {
		res.status(400).json(error)
	}
}

// POST
async function create(req, res, next) {
	console.log(req.body)
	try {
		const attendee = req.body.attendee
		attendee.owner = req.user._id
		await Attendee.create(req.body.attendee).then((attendee) => {
			res.status(201).json({ attendee: attendee })
		})
	} catch (error) {
		res.status(400).json(error)
	}
}


// PATCH
async function patch(req, res, next) {
	try {
		const attendee = req.body.attendee
		await Attendee.findById(req.params.id)
			.then((attendee) => {
				return attendee.updateOne(req.body.attendee)
			})
			.then((attendee) => {
				res.status(202).json({ attendee: attendee })
			})
	} catch (error) {
		res.status(400).json(error)
	}
}

// DELETE
async function remove(req, res, next) {
	try {
		await Attendee.findById(req.params.id)
			.then((attendee) => {
				return attendee.deleteOne()
			})
			.then((attendee) => {
				res.status(204).json({ attendee: attendee })
			})
	} catch (error) {
		res.status(400).json(error)
	}
}

module.exports = {
	index,
	show,
	create,
	patch,
	remove,
	showAll
}
