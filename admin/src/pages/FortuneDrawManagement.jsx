import { useState, useEffect } from 'react';
import {
  Box,
  Paper,
  Typography,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Chip,
  CircularProgress,
  IconButton,
  Select,
  MenuItem,
  FormControl,
  InputLabel
} from '@mui/material';
import { Add, Edit, Delete, Image as ImageIcon } from '@mui/icons-material';
import { adminAPI } from '../services/api';

function FortuneDrawManagement() {
  const [lotteries, setLotteries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [openDialog, setOpenDialog] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [selectedLottery, setSelectedLottery] = useState(null);
  const [carImage, setCarImage] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    ticketPrice: 100,
    prizeType: 'car',
    prizeAmount: '',
    prizeDetails: '',
    drawDate: '',
    disclaimer: 'This is a lottery-based promotional activity. Winning depends on chance and participation level. No guaranteed winnings.'
  });

  useEffect(() => {
    fetchLotteries();
  }, []);

  const fetchLotteries = async () => {
    try {
      const response = await adminAPI.getLotteryEvents();
      setLotteries(response.data.data);
    } catch (error) {
      console.error('Error fetching lotteries:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    try {
      const formDataToSend = new FormData();
      formDataToSend.append('name', formData.name);
      formDataToSend.append('description', formData.description);
      formDataToSend.append('ticketPrice', formData.ticketPrice);
      formDataToSend.append('prizeType', formData.prizeType);
      if (formData.prizeType === 'cash') {
        formDataToSend.append('prizeAmount', formData.prizeAmount);
      } else {
        formDataToSend.append('prizeDetails', formData.prizeDetails);
        if (carImage) {
          formDataToSend.append('carImage', carImage);
        }
      }
      formDataToSend.append('drawDate', formData.drawDate);
      formDataToSend.append('disclaimer', formData.disclaimer);
      
      await adminAPI.createLottery(formDataToSend);
      resetForm();
      fetchLotteries();
    } catch (error) {
      console.error('Error creating lottery:', error);
      alert('Failed to create fortune draw event');
    }
  };

  const handleUpdate = async () => {
    try {
      const formDataToSend = new FormData();
      formDataToSend.append('name', formData.name);
      formDataToSend.append('description', formData.description);
      formDataToSend.append('ticketPrice', formData.ticketPrice);
      formDataToSend.append('prizeType', formData.prizeType);
      if (formData.prizeType === 'cash') {
        formDataToSend.append('prizeAmount', formData.prizeAmount);
      } else {
        formDataToSend.append('prizeDetails', formData.prizeDetails);
        if (carImage) {
          formDataToSend.append('carImage', carImage);
        }
      }
      formDataToSend.append('drawDate', formData.drawDate);
      formDataToSend.append('disclaimer', formData.disclaimer);
      
      await adminAPI.updateLottery(selectedLottery.id, formDataToSend);
      resetForm();
      fetchLotteries();
    } catch (error) {
      console.error('Error updating lottery:', error);
      alert('Failed to update fortune draw event');
    }
  };

  const handleEdit = (lottery) => {
    setEditMode(true);
    setSelectedLottery(lottery);
    setFormData({
      name: lottery.name,
      description: lottery.description || '',
      ticketPrice: lottery.ticket_price,
      prizeType: lottery.prize_type || 'car',
      prizeAmount: lottery.prize_amount || '',
      prizeDetails: lottery.prize_details || '',
      drawDate: lottery.draw_date.split('T')[0],
      disclaimer: lottery.disclaimer || ''
    });
    setOpenDialog(true);
  };

  const resetForm = () => {
    setOpenDialog(false);
    setEditMode(false);
    setSelectedLottery(null);
    setCarImage(null);
    setFormData({
      name: '',
      description: '',
      ticketPrice: 100,
      prizeType: 'car',
      prizeAmount: '',
      prizeDetails: '',
      drawDate: '',
      disclaimer: 'This is a lottery-based promotional activity. Winning depends on chance and participation level. No guaranteed winnings.'
    });
  };

  const handleActivate = async (id) => {
    try {
      await adminAPI.updateLottery(id, { status: 'active', registrationsOpen: true });
      fetchLotteries();
    } catch (error) {
      console.error('Error activating lottery:', error);
    }
  };

  const handleClose = async (id) => {
    try {
      await adminAPI.updateLottery(id, { registrationsOpen: false });
      fetchLotteries();
    } catch (error) {
      console.error('Error closing lottery:', error);
    }
  };
  const handleDelete = async (lottery) => {
    if (!window.confirm(`Are you sure you want to delete "${lottery.name}"? This action cannot be undone.`)) {
      return;
    }
    try {
      await adminAPI.deleteLottery(lottery.id);
      alert('Fortune draw event deleted successfully');
      fetchLotteries();
    } catch (error) {
      console.error('Error deleting fortune draw event:', error);
      if (error.response?.data?.message) {
        alert(error.response.data.message);
      } else {
        alert('Failed to delete fortune draw event. It may have associated payments.');
      }
    }
  };
  const getStatusColor = (status) => {
    const colors = {
      draft: 'default',
      active: 'success',
      closed: 'warning',
      drawn: 'primary'
    };
    return colors[status] || 'default';
  };

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Typography variant="h4" sx={{ fontWeight: 700 }}>
          Fortune Draw Events
        </Typography>
        <Button
          variant="contained"
          startIcon={<Add />}
          onClick={() => setOpenDialog(true)}
        >
          Create New Lottery
        </Button>
      </Box>
      
      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell><strong>Name</strong></TableCell>
              <TableCell><strong>Prize</strong></TableCell>
              <TableCell><strong>Draw Date</strong></TableCell>
              <TableCell align="right"><strong>Ticket Price</strong></TableCell>
              <TableCell align="center"><strong>Status</strong></TableCell>
              <TableCell align="center"><strong>Actions</strong></TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {lotteries.map((lottery) => (
              <TableRow key={lottery.id}>
                <TableCell>{lottery.name}</TableCell>
                <TableCell>
                  {lottery.prize_type === 'car' ? (
                    `🚗 ${lottery.prize_details}`
                  ) : (
                    `₹${lottery.prize_amount?.toLocaleString()}`
                  )}
                </TableCell>
                <TableCell>{new Date(lottery.draw_date).toLocaleDateString('en-IN')}</TableCell>
                <TableCell align="right">₹{lottery.ticket_price}</TableCell>
                <TableCell align="center">
                  <Chip 
                    label={lottery.status} 
                    color={getStatusColor(lottery.status)} 
                    size="small" 
                  />
                </TableCell>
                <TableCell align="center">
                  <IconButton size="small" onClick={() => handleEdit(lottery)} color="primary">
                    <Edit />
                  </IconButton>
                  <IconButton size="small" onClick={() => handleDelete(lottery)} color="error">
                    <Delete />
                  </IconButton>
                  {lottery.status === 'draft' && (
                    <Button size="small" onClick={() => handleActivate(lottery.id)}>
                      Activate
                    </Button>
                  )}
                  {lottery.status === 'active' && lottery.registrations_open && (
                    <Button size="small" color="warning" onClick={() => handleClose(lottery.id)}>
                      Close
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
      
      <Dialog open={openDialog} onClose={resetForm} maxWidth="sm" fullWidth>
        <DialogTitle>{editMode ? 'Edit fortune draw event' : 'Create New fortune draw event'}</DialogTitle>
        <DialogContent>
          <TextField
            fullWidth
            label="Event Name"
            margin="normal"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            required
          />
          <TextField
            fullWidth
            label="Description"
            margin="normal"
            multiline
            rows={2}
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          />
          
          <FormControl fullWidth margin="normal">
            <InputLabel>Prize Type</InputLabel>
            <Select
              value={formData.prizeType}
              label="Prize Type"
              onChange={(e) => setFormData({ ...formData, prizeType: e.target.value })}
            >
              <MenuItem value="car">Car</MenuItem>
              <MenuItem value="cash">Cash</MenuItem>
            </Select>
          </FormControl>
          
          {formData.prizeType === 'car' ? (
            <>
              <TextField
                fullWidth
                label="Car Model Name"
                margin="normal"
                value={formData.prizeDetails}
                onChange={(e) => setFormData({ ...formData, prizeDetails: e.target.value })}
                placeholder="e.g., Maruti Swift Dzire"
                required
              />
              <Button
                variant="outlined"
                component="label"
                startIcon={<ImageIcon />}
                fullWidth
                sx={{ mt: 2 }}
              >
                {carImage ? carImage.name : 'Upload Car Image'}
                <input
                  type="file"
                  hidden
                  accept="image/*"
                  onChange={(e) => setCarImage(e.target.files[0])}
                />
              </Button>
            </>
          ) : (
            <TextField
              fullWidth
              label="Prize Amount (₹)"
              type="number"
              margin="normal"
              value={formData.prizeAmount}
              onChange={(e) => setFormData({ ...formData, prizeAmount: e.target.value })}
              required
            />
          )}
          
          <TextField
            fullWidth
            label="Ticket Price (₹)"
            type="number"
            margin="normal"
            value={formData.ticketPrice}
            onChange={(e) => setFormData({ ...formData, ticketPrice: e.target.value })}
            required
          />
          <TextField
            fullWidth
            label="Draw Date"
            type="date"
            margin="normal"
            InputLabelProps={{ shrink: true }}
            value={formData.drawDate}
            onChange={(e) => setFormData({ ...formData, drawDate: e.target.value })}
            required
          />
          <TextField
            fullWidth
            label="Disclaimer"
            margin="normal"
            multiline
            rows={3}
            value={formData.disclaimer}
            onChange={(e) => setFormData({ ...formData, disclaimer: e.target.value })}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={resetForm}>Cancel</Button>
          <Button onClick={editMode ? handleUpdate : handleCreate} variant="contained">
            {editMode ? 'Update' : 'Create'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

export default FortuneDrawManagement;
